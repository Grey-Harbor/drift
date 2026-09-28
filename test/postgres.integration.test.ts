import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { PostgresDriftRepository } from '../src/adapters/postgres/repository.js';
import { buildApp } from '../src/api/app.js';
import { DriftService } from '../src/core/service.js';
import { runRepositoryConformance } from './support/repository-conformance.js';

const connectionString = process.env.DRIFT_TEST_POSTGRES_URL;
const { Pool } = pg;

async function resetDatabase() {
  const pool = new Pool({ connectionString });
  try {
    await pool.query('TRUNCATE edges, vertices, api_keys, tenants');
  } finally {
    await pool.end();
  }
}

if (!connectionString) {
  test('PostgreSQL integration tests require DRIFT_TEST_POSTGRES_URL', { skip: true }, () => {});
} else {
  runRepositoryConformance('PostgreSQL', async () => {
    const repository = await PostgresDriftRepository.open(connectionString);
    await resetDatabase();
    return repository;
  });

  test('PostgreSQL rejects changed migration checksums', async () => {
    const pool = new Pool({ connectionString });
    const original = await pool.query<{ checksum: string }>(
      'SELECT checksum FROM drift_schema_migrations WHERE version=1',
    );
    await pool.query("UPDATE drift_schema_migrations SET checksum='changed' WHERE version=1");
    try {
      await assert.rejects(
        () => PostgresDriftRepository.open(connectionString),
        /checksum mismatch/,
      );
    } finally {
      await pool.query('UPDATE drift_schema_migrations SET checksum=$1 WHERE version=1', [
        original.rows[0]!.checksum,
      ]);
      await pool.end();
    }
  });

  test('PostgreSQL migrations install the graph access indexes', async () => {
    const pool = new Pool({ connectionString });
    try {
      const result = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname=current_schema()
           AND indexname=ANY($1::text[])
         ORDER BY indexname`,
        [
          [
            'edges_active_list',
            'edges_from',
            'edges_text_id',
            'edges_to',
            'vertices_active_list',
            'vertices_text_id',
          ],
        ],
      );
      assert.deepEqual(
        result.rows.map((row) => row.indexname),
        [
          'edges_active_list',
          'edges_from',
          'edges_text_id',
          'edges_to',
          'vertices_active_list',
          'vertices_text_id',
        ],
      );
    } finally {
      await pool.end();
    }
  });

  test('PostgreSQL repository shutdown drains its pool', async () => {
    const repository = await PostgresDriftRepository.open(connectionString);
    await repository.close();
    await assert.rejects(() =>
      repository.listVertices(crypto.randomUUID(), { limit: 1, includeDeleted: false }),
    );
  });

  test('PostgreSQL prevents active edges from surviving concurrent vertex deletion', async (t) => {
    const repository = await PostgresDriftRepository.open(connectionString);
    t.after(() => repository.close());
    await resetDatabase();
    const service = new DriftService(repository);
    const boot = await service.bootstrap(`concurrent-${crypto.randomUUID()}`, 'Concurrent');
    const admin = await service.authenticate(boot.key.secret);
    const input = {
      type: 'asset',
      slug: null,
      externalId: null,
      title: null,
      status: 'active',
      data: {},
      metadata: {},
    };
    const source = await service.createVertex(admin, input);
    const target = await service.createVertex(admin, input);
    await Promise.allSettled([
      service.createEdge(admin, {
        fromVertexId: source.id,
        toVertexId: target.id,
        type: 'contains',
        status: 'active',
        data: {},
        metadata: {},
      }),
      service.deleteVertex(admin, source.id, source.version),
    ]);
    const edges = await service.listEdges(admin, { limit: 10, includeDeleted: true });
    assert.equal(
      edges.items.some((edge) => edge.deletedAt === null),
      false,
    );
  });

  test('PostgreSQL serializes endpoint-changing updates with vertex deletion', async (t) => {
    const repository = await PostgresDriftRepository.open(connectionString);
    t.after(() => repository.close());
    await resetDatabase();
    const service = new DriftService(repository);
    const boot = await service.bootstrap(`rewire-${crypto.randomUUID()}`, 'Rewire');
    const admin = await service.authenticate(boot.key.secret);
    const input = {
      type: 'asset',
      slug: null,
      externalId: null,
      title: null,
      status: 'active',
      data: {},
      metadata: {},
    };
    const source = await service.createVertex(admin, input);
    const originalTarget = await service.createVertex(admin, input);
    const newTarget = await service.createVertex(admin, input);
    const edge = await service.createEdge(admin, {
      fromVertexId: source.id,
      toVertexId: originalTarget.id,
      type: 'contains',
      status: 'active',
      data: {},
      metadata: {},
    });

    await Promise.allSettled([
      service.patchEdge(admin, edge.id, edge.version, { toVertexId: newTarget.id }),
      service.deleteVertex(admin, newTarget.id, newTarget.version),
    ]);

    const current = await service.getEdge(admin, edge.id, true);
    if (current.deletedAt === null) {
      assert.equal(current.toVertexId, originalTarget.id);
      assert.equal((await service.getVertex(admin, current.toVertexId)).deletedAt, null);
    }
  });

  test('PostgreSQL serves the unchanged HTTP contract', async () => {
    const repository = await PostgresDriftRepository.open(connectionString);
    await resetDatabase();
    const service = new DriftService(repository);
    const boot = await service.bootstrap(`http-${crypto.randomUUID()}`, 'HTTP');
    const app = buildApp(service);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/vertices',
        headers: { authorization: `Bearer ${boot.key.secret}` },
        payload: { type: 'asset', data: null },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().data, null);
    } finally {
      await app.close();
    }
  });

  test('PostgreSQL reports connection failures during open', async () => {
    await assert.rejects(
      () =>
        PostgresDriftRepository.open(
          'postgresql://drift:drift@127.0.0.1:1/drift_test?connect_timeout=1',
        ),
      /ECONNREFUSED/,
    );
  });
}
