import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createPostgresPool, withTransaction } from './connection.js';
import {
  mapApiKey as mapPostgresApiKey,
  mapEdge as mapPostgresEdge,
  mapTenant as mapPostgresTenant,
  mapVertex as mapPostgresVertex,
} from './mappers.js';
import { migrate } from './migrations.js';
import {
  mapApiKey as mapSqliteApiKey,
  mapEdge as mapSqliteEdge,
  mapTenant as mapSqliteTenant,
  mapVertex as mapSqliteVertex,
} from '../sqlite/mappers.js';

const applicationTables = ['tenants', 'api_keys', 'vertices', 'edges'] as const;
type ApplicationTable = (typeof applicationTables)[number];
type Row = Record<string, unknown>;

interface Verification {
  count: number;
  sha256: string;
}

export interface MigrationSummary {
  verified: true;
  tables: Record<ApplicationTable, Verification>;
}

export async function migrateSqliteToPostgres(
  sqlitePath: string,
  connectionString: string,
  batchSize = 500,
): Promise<MigrationSummary> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be positive');
  const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = createPostgresPool(connectionString);
  try {
    await migrate(pool);
    return await withTransaction(pool, async (client) => {
      await assertTargetEmpty(client);
      source.exec('BEGIN');
      try {
        const copied = {} as Record<ApplicationTable, Verification>;
        for (const table of applicationTables)
          copied[table] = await copyTable(source, client, table, batchSize);
        const verified = {} as Record<ApplicationTable, Verification>;
        for (const table of applicationTables)
          verified[table] = await digestPostgresTable(client, table, batchSize);
        for (const table of applicationTables) {
          if (
            copied[table].count !== verified[table].count ||
            copied[table].sha256 !== verified[table].sha256
          )
            throw new Error(`Verification failed for ${table}`);
        }
        source.exec('COMMIT');
        return { verified: true, tables: verified };
      } catch (error) {
        if (source.inTransaction) source.exec('ROLLBACK');
        throw error;
      }
    });
  } finally {
    source.close();
    await pool.end();
  }
}

async function assertTargetEmpty(client: PoolClient) {
  for (const table of applicationTables) {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${table}`);
    if (Number(result.rows[0]?.count) !== 0)
      throw new Error('PostgreSQL destination application tables must be empty');
  }
}

async function copyTable(
  source: Database.Database,
  target: PoolClient,
  table: ApplicationTable,
  batchSize: number,
): Promise<Verification> {
  const hash = createHash('sha256');
  let count = 0;
  let cursor = '';
  for (;;) {
    const rows = source
      .prepare(`SELECT * FROM ${table} WHERE ?='' OR id>? ORDER BY id ASC LIMIT ?`)
      .all(cursor, cursor, batchSize) as Row[];
    if (!rows.length) break;
    for (const row of rows) {
      await insertRow(target, table, row);
      hash.update(canonicalJson(mapRow(table, row, 'sqlite'))).update('\n');
      count++;
    }
    cursor = String(rows.at(-1)!.id);
  }
  return { count, sha256: hash.digest('hex') };
}

async function digestPostgresTable(
  client: PoolClient,
  table: ApplicationTable,
  batchSize: number,
): Promise<Verification> {
  const hash = createHash('sha256');
  let count = 0;
  let cursor = '';
  for (;;) {
    const result = await client.query(
      `SELECT * FROM ${table}
       WHERE $1::text='' OR id::text>$1
       ORDER BY id::text ASC LIMIT $2`,
      [cursor, batchSize],
    );
    if (!result.rows.length) break;
    for (const row of result.rows) {
      hash.update(canonicalJson(mapRow(table, row, 'postgres'))).update('\n');
      count++;
    }
    cursor = String(result.rows.at(-1)!.id);
  }
  return { count, sha256: hash.digest('hex') };
}

function mapRow(table: ApplicationTable, row: Row, source: 'sqlite' | 'postgres') {
  if (source === 'sqlite') {
    if (table === 'tenants') return mapSqliteTenant(row);
    if (table === 'api_keys') return mapSqliteApiKey(row);
    if (table === 'vertices') return mapSqliteVertex(row);
    return mapSqliteEdge(row);
  }
  if (table === 'tenants') return mapPostgresTenant(row);
  if (table === 'api_keys') return mapPostgresApiKey(row);
  if (table === 'vertices') return mapPostgresVertex(row);
  return mapPostgresEdge(row);
}

async function insertRow(client: PoolClient, table: ApplicationTable, row: Row) {
  if (table === 'tenants') {
    await client.query(
      `INSERT INTO tenants(id,slug,name,status,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [row.id, row.slug, row.name, row.status, row.created_at, row.updated_at],
    );
    return;
  }
  if (table === 'api_keys') {
    await client.query(
      `INSERT INTO api_keys(id,tenant_id,label,prefix,secret_hash,scopes,created_at,last_used_at,revoked_at)
       VALUES($1,$2,$3,$4,$5,$6::text[],$7,$8,$9)`,
      [
        row.id,
        row.tenant_id,
        row.label,
        row.prefix,
        row.secret_hash,
        JSON.parse(String(row.scopes)),
        row.created_at,
        row.last_used_at,
        row.revoked_at,
      ],
    );
    return;
  }
  if (table === 'vertices') {
    await client.query(
      `INSERT INTO vertices(id,tenant_id,type,slug,external_id,title,status,data,metadata,version,created_at,updated_at,deleted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13)`,
      [
        row.id,
        row.tenant_id,
        row.type,
        row.slug,
        row.external_id,
        row.title,
        row.status,
        row.data,
        row.metadata,
        row.version,
        row.created_at,
        row.updated_at,
        row.deleted_at,
      ],
    );
    return;
  }
  await client.query(
    `INSERT INTO edges(id,tenant_id,from_vertex_id,to_vertex_id,type,status,data,metadata,version,created_at,updated_at,deleted_at)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
    [
      row.id,
      row.tenant_id,
      row.from_vertex_id,
      row.to_vertex_id,
      row.type,
      row.status,
      row.data,
      row.metadata,
      row.version,
      row.created_at,
      row.updated_at,
      row.deleted_at,
    ],
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  return value;
}
