import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { migrateSqliteToPostgres } from '../src/adapters/postgres/sqlite-import.js';
import { PostgresDriftRepository } from '../src/adapters/postgres/repository.js';
import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { DriftService } from '../src/core/service.js';

const connectionString = process.env.DRIFT_TEST_POSTGRES_URL;
const { Pool } = pg;

if (!connectionString) {
  test('SQLite-to-PostgreSQL migration requires DRIFT_TEST_POSTGRES_URL', { skip: true }, () => {});
} else {
  test('SQLite-to-PostgreSQL migration preserves and verifies application data', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'drift-migration-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'source.sqlite');
    const sqlite = new SqliteDriftRepository(path);
    const sourceService = new DriftService(sqlite);
    const boot = await sourceService.bootstrap('migration', 'Migration');
    const admin = await sourceService.authenticate(boot.key.secret);
    const otherBoot = await sourceService.bootstrap('migration-other', 'Migration Other');
    const otherAdmin = await sourceService.authenticate(otherBoot.key.secret);
    const first = await sourceService.createVertex(admin, {
      type: 'asset',
      slug: 'first',
      externalId: null,
      title: 'First',
      status: 'active',
      data: null,
      metadata: { source: 'migration-test' },
    });
    const second = await sourceService.createVertex(admin, {
      type: 'asset',
      slug: 'second',
      externalId: null,
      title: 'Second',
      status: 'active',
      data: { nested: true },
      metadata: {},
    });
    const edge = await sourceService.createEdge(admin, {
      fromVertexId: first.id,
      toVertexId: second.id,
      type: 'contains',
      status: 'active',
      data: {},
      metadata: {},
    });
    const otherVertex = await sourceService.createVertex(otherAdmin, {
      type: 'private',
      slug: null,
      externalId: 'other-tenant',
      title: 'Other tenant',
      status: 'active',
      data: false,
      metadata: {},
    });
    await sourceService.deleteVertex(admin, first.id, first.version);
    await sourceService.close();

    const pool = new Pool({ connectionString });
    await pool.query('TRUNCATE edges, vertices, api_keys, tenants');
    await pool.end();

    const summary = await migrateSqliteToPostgres(path, connectionString, 1);
    assert.equal(summary.verified, true);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(summary.tables).map(([table, value]) => [table, value.count]),
      ),
      { tenants: 2, api_keys: 2, vertices: 3, edges: 1 },
    );

    const postgres = await PostgresDriftRepository.open(connectionString);
    t.after(() => postgres.close());
    const targetService = new DriftService(postgres);
    const migratedAdmin = await targetService.authenticate(boot.key.secret);
    assert.equal((await targetService.getVertex(migratedAdmin, first.id, true)).data, null);
    assert.deepEqual((await targetService.getVertex(migratedAdmin, second.id)).data, {
      nested: true,
    });
    assert.ok((await targetService.getEdge(migratedAdmin, edge.id, true)).deletedAt);
    const migratedOtherAdmin = await targetService.authenticate(otherBoot.key.secret);
    assert.equal((await targetService.getVertex(migratedOtherAdmin, otherVertex.id)).data, false);
    await assert.rejects(() => targetService.getVertex(migratedAdmin, otherVertex.id), {
      code: 'not_found',
    });
    await assert.rejects(
      () => migrateSqliteToPostgres(path, connectionString),
      /destination application tables must be empty/,
    );
  });

  test('SQLite-to-PostgreSQL migration rolls back destination rows on copy failure', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'drift-migration-failure-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'invalid.sqlite');
    const repository = new SqliteDriftRepository(path);
    await repository.close();
    const source = new Database(path);
    const tenantId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    source
      .prepare('INSERT INTO tenants VALUES (?,?,?,?,?,?)')
      .run(tenantId, 'invalid', 'Invalid', 'active', timestamp, timestamp);
    source.pragma('foreign_keys = OFF');
    source
      .prepare('INSERT INTO edges VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        crypto.randomUUID(),
        tenantId,
        crypto.randomUUID(),
        crypto.randomUUID(),
        'invalid',
        'active',
        '{}',
        '{}',
        1,
        timestamp,
        timestamp,
        null,
      );
    source.close();

    const pool = new Pool({ connectionString });
    await pool.query('TRUNCATE edges, vertices, api_keys, tenants');
    await assert.rejects(() => migrateSqliteToPostgres(path, connectionString), /foreign key/);
    for (const table of ['tenants', 'api_keys', 'vertices', 'edges']) {
      const result = await pool.query(`SELECT COUNT(*) AS count FROM ${table}`);
      assert.equal(Number(result.rows[0]!.count), 0);
    }
    await pool.end();
  });

  test('SQLite-to-PostgreSQL migration rolls back on digest verification failure', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'drift-migration-verification-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'source.sqlite');
    const source = new SqliteDriftRepository(path);
    const service = new DriftService(source);
    const boot = await service.bootstrap('verification', 'Verification');
    const admin = await service.authenticate(boot.key.secret);
    await service.createVertex(admin, {
      type: 'asset',
      slug: null,
      externalId: null,
      title: 'Original',
      status: 'active',
      data: {},
      metadata: {},
    });
    await service.close();

    const pool = new Pool({ connectionString });
    await pool.query('TRUNCATE edges, vertices, api_keys, tenants');
    await pool.query(`
      CREATE OR REPLACE FUNCTION drift_test_change_vertex() RETURNS trigger AS $$
      BEGIN
        NEW.title := 'Changed by test trigger';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER drift_test_change_vertex
      BEFORE INSERT ON vertices
      FOR EACH ROW EXECUTE FUNCTION drift_test_change_vertex()
    `);
    try {
      await assert.rejects(
        () => migrateSqliteToPostgres(path, connectionString),
        /Verification failed for vertices/,
      );
      for (const table of ['tenants', 'api_keys', 'vertices', 'edges']) {
        const result = await pool.query(`SELECT COUNT(*) AS count FROM ${table}`);
        assert.equal(Number(result.rows[0]!.count), 0);
      }
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS drift_test_change_vertex ON vertices');
      await pool.query('DROP FUNCTION IF EXISTS drift_test_change_vertex()');
      await pool.end();
    }
  });
}
