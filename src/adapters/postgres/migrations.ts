import { createHash } from 'node:crypto';
import type { PostgresPool } from './connection.js';
import { withTransaction } from './connection.js';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  label TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE TABLE vertices (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  slug TEXT,
  external_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id)
);
CREATE TABLE edges (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_vertex_id UUID NOT NULL,
  to_vertex_id UUID NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, from_vertex_id) REFERENCES vertices(tenant_id, id),
  FOREIGN KEY (tenant_id, to_vertex_id) REFERENCES vertices(tenant_id, id)
);
CREATE INDEX vertices_active_list ON vertices(tenant_id, deleted_at, type, status, (id::text));
CREATE INDEX vertices_text_id ON vertices(tenant_id, (id::text));
CREATE INDEX edges_active_list ON edges(tenant_id, deleted_at, type, status, (id::text));
CREATE INDEX edges_text_id ON edges(tenant_id, (id::text));
CREATE INDEX edges_from ON edges(tenant_id, (from_vertex_id::text), deleted_at);
CREATE INDEX edges_to ON edges(tenant_id, (to_vertex_id::text), deleted_at);
`,
  },
];

const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

export async function migrate(pool: PostgresPool) {
  const versionResult = await pool.query<{ server_version_num: string }>('SHOW server_version_num');
  const version = Number(versionResult.rows[0]?.server_version_num);
  if (!Number.isInteger(version) || version < 160000)
    throw new Error('Drift requires PostgreSQL 16 or newer');

  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [68473, 1]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS drift_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM drift_schema_migrations ORDER BY version',
    );
    const byVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    for (const migration of migrations) {
      const expected = checksum(migration.sql);
      const existing = byVersion.get(migration.version);
      if (existing && existing !== expected)
        throw new Error(`PostgreSQL migration ${migration.version} checksum mismatch`);
      if (existing) continue;
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO drift_schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
        [migration.version, migration.name, expected],
      );
    }
  });
}
