import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ApiKey,
  Edge,
  Json,
  ListOptions,
  Page,
  RetrieveInput,
  RetrieveResult,
  Tenant,
  TraverseInput,
  TraverseResult,
  Vertex,
} from '../../contracts/types.js';
import type { DriftRepository } from '../../interfaces/repository.js';
import { migrate } from './migrations.js';

const json = (value: unknown): Json => JSON.parse(String(value)) as Json;
const encode = (value: unknown) => JSON.stringify(value);
const tenant = (r: any): Tenant => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const key = (r: any): ApiKey & { secretHash: string } => ({
  id: r.id,
  tenantId: r.tenant_id,
  label: r.label,
  prefix: r.prefix,
  scopes: json(r.scopes) as ApiKey['scopes'],
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  revokedAt: r.revoked_at,
  secretHash: r.secret_hash,
});
const vertex = (r: any): Vertex => ({
  id: r.id,
  tenantId: r.tenant_id,
  type: r.type,
  slug: r.slug,
  externalId: r.external_id,
  title: r.title,
  status: r.status,
  data: json(r.data),
  metadata: json(r.metadata),
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
const edge = (r: any): Edge => ({
  id: r.id,
  tenantId: r.tenant_id,
  fromVertexId: r.from_vertex_id,
  toVertexId: r.to_vertex_id,
  type: r.type,
  status: r.status,
  data: json(r.data),
  metadata: json(r.metadata),
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
const cursor = (id: string) => Buffer.from(id).toString('base64url');
const uncursor = (value?: string) =>
  value ? Buffer.from(value, 'base64url').toString() : undefined;

export class SqliteDriftRepository implements DriftRepository {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    migrate(this.db);
  }
  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }
  createTenant(v: Tenant) {
    this.db
      .prepare('INSERT INTO tenants VALUES (@id,@slug,@name,@status,@createdAt,@updatedAt)')
      .run(v);
  }
  findTenantBySlug(slug: string) {
    const r = this.db.prepare('SELECT * FROM tenants WHERE slug=?').get(slug);
    return r ? tenant(r) : null;
  }
  createApiKey(v: ApiKey & { secretHash: string }) {
    this.db
      .prepare(
        'INSERT INTO api_keys VALUES (@id,@tenantId,@label,@prefix,@secretHash,@scopes,@createdAt,@lastUsedAt,@revokedAt)',
      )
      .run({ ...v, scopes: encode(v.scopes) });
  }
  findApiKeyByPrefix(prefix: string) {
    const r = this.db.prepare('SELECT * FROM api_keys WHERE prefix=?').get(prefix);
    return r ? key(r) : null;
  }
  touchApiKey(id: string, at: string) {
    this.db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(at, id);
  }
  listApiKeys(tenantId: string) {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE tenant_id=? ORDER BY created_at DESC')
      .all(tenantId)
      .map(key)
      .map(({ secretHash, ...v }) => v);
  }
  revokeApiKey(tenantId: string, id: string, at: string) {
    return (
      this.db
        .prepare(
          'UPDATE api_keys SET revoked_at=? WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
        )
        .run(at, tenantId, id).changes === 1
    );
  }
  createVertex(v: Vertex) {
    this.db
      .prepare(
        'INSERT INTO vertices VALUES (@id,@tenantId,@type,@slug,@externalId,@title,@status,@data,@metadata,@version,@createdAt,@updatedAt,@deletedAt)',
      )
      .run({ ...v, data: encode(v.data), metadata: encode(v.metadata) });
  }
  getVertex(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM vertices WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? vertex(r) : null;
  }
  listVertices(t: string, o: ListOptions) {
    return this.list('vertices', vertex, t, o);
  }
  updateVertex(t: string, id: string, version: number, p: Partial<Vertex>, at: string) {
    return this.update('vertices', vertex, t, id, version, p, at);
  }
  softDeleteVertexWithEdges(t: string, id: string, version: number, at: string) {
    const v = this.db
      .prepare(
        'UPDATE vertices SET deleted_at=?,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=? RETURNING *',
      )
      .get(at, at, t, id, version);
    if (!v) return null;
    this.db
      .prepare(
        'UPDATE edges SET deleted_at=?,updated_at=?,version=version+1 WHERE tenant_id=? AND deleted_at IS NULL AND (from_vertex_id=? OR to_vertex_id=?)',
      )
      .run(at, at, t, id, id);
    return vertex(v);
  }
  restoreVertex(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE vertices SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
      )
      .get(at, t, id, version);
    return r ? vertex(r) : null;
  }
  createEdge(v: Edge) {
    this.db
      .prepare(
        'INSERT INTO edges VALUES (@id,@tenantId,@fromVertexId,@toVertexId,@type,@status,@data,@metadata,@version,@createdAt,@updatedAt,@deletedAt)',
      )
      .run({ ...v, data: encode(v.data), metadata: encode(v.metadata) });
  }
  getEdge(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM edges WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? edge(r) : null;
  }
  listEdges(t: string, o: ListOptions) {
    return this.list('edges', edge, t, o);
  }
  updateEdge(t: string, id: string, version: number, p: Partial<Edge>, at: string) {
    return this.update('edges', edge, t, id, version, p, at);
  }
  softDeleteEdge(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE edges SET deleted_at=?,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=? RETURNING *',
      )
      .get(at, at, t, id, version);
    return r ? edge(r) : null;
  }
  restoreEdge(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE edges SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
      )
      .get(at, t, id, version);
    return r ? edge(r) : null;
  }
  private list<T>(table: string, map: (r: any) => T, t: string, o: ListOptions): Page<T> {
    const where = ['tenant_id=@t'];
    const params: any = { t, limit: o.limit + 1 };
    if (!o.includeDeleted) where.push('deleted_at IS NULL');
    if (o.type) {
      where.push('type=@type');
      params.type = o.type;
    }
    if (o.status) {
      where.push('status=@status');
      params.status = o.status;
    }
    if (o.fromVertexId && table === 'edges') {
      where.push('from_vertex_id=@from');
      params.from = o.fromVertexId;
    }
    if (o.toVertexId && table === 'edges') {
      where.push('to_vertex_id=@to');
      params.to = o.toVertexId;
    }
    const c = uncursor(o.cursor);
    if (c) {
      where.push('id>@cursor');
      params.cursor = c;
    }
    const rows = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT @limit`)
      .all(params);
    const items = rows.slice(0, o.limit).map(map);
    return { items, nextCursor: rows.length > o.limit ? cursor((items.at(-1) as any).id) : null };
  }
  private update<T>(
    table: string,
    map: (r: any) => T,
    t: string,
    id: string,
    version: number,
    p: any,
    at: string,
  ): T | null {
    const columns: any = {};
    for (const [k, v] of Object.entries(p)) {
      const c: { [k: string]: string } = {
        externalId: 'external_id',
        fromVertexId: 'from_vertex_id',
        toVertexId: 'to_vertex_id',
      };
      if (
        [
          'type',
          'slug',
          'externalId',
          'title',
          'status',
          'data',
          'metadata',
          'fromVertexId',
          'toVertexId',
        ].includes(k)
      )
        columns[c[k] ?? k] = k === 'data' || k === 'metadata' ? encode(v) : v;
    }
    const sets = Object.keys(columns).map((k) => `${k}=@${k}`);
    if (!sets.length)
      return table === 'vertices'
        ? (this.getVertex(t, id, true) as T | null)
        : (this.getEdge(t, id, true) as T | null);
    sets.push('updated_at=@at', 'version=version+1');
    const r = this.db
      .prepare(
        `UPDATE ${table} SET ${sets.join(',')} WHERE tenant_id=@t AND id=@id AND deleted_at IS NULL AND version=@version RETURNING *`,
      )
      .get({ ...columns, t, id, version, at });
    return r ? map(r) : null;
  }
  traverse(t: string, input: TraverseInput): TraverseResult {
    const seen = new Set([input.start]);
    const vertices: Vertex[] = [];
    const edges: Edge[] = [];
    let frontier = [input.start];
    for (
      let level = 0;
      level < input.depth && frontier.length && vertices.length + edges.length < input.limit;
      level++
    ) {
      const placeholders = frontier.map(() => '?').join(',');
      const dirs =
        input.direction === 'out'
          ? `from_vertex_id IN (${placeholders})`
          : input.direction === 'in'
            ? `to_vertex_id IN (${placeholders})`
            : `(from_vertex_id IN (${placeholders}) OR to_vertex_id IN (${placeholders}))`;
      const args = input.direction === 'both' ? [t, ...frontier, ...frontier] : [t, ...frontier];
      let sql = `SELECT * FROM edges WHERE tenant_id=? AND ${dirs}`;
      if (!input.includeDeleted) sql += ' AND deleted_at IS NULL';
      if (input.edgeTypes?.length)
        sql += ` AND type IN (${input.edgeTypes.map(() => '?').join(',')})`;
      const found = this.db
        .prepare(sql)
        .all(...args, ...(input.edgeTypes ?? []))
        .map(edge);
      const next: string[] = [];
      for (const e of found) {
        if (edges.length >= input.limit) break;
        edges.push(e);
        for (const id of [e.fromVertexId, e.toVertexId])
          if (!seen.has(id)) {
            seen.add(id);
            next.push(id);
          }
      }
      frontier = next;
    }
    for (const id of [...seen]) {
      if (id === input.start) continue;
      const v = this.getVertex(t, id, input.includeDeleted);
      if (v && (!input.vertexTypes?.length || input.vertexTypes.includes(v.type))) vertices.push(v);
    }
    const start = this.getVertex(t, input.start, input.includeDeleted);
    if (start) vertices.unshift(start);
    return { vertices: vertices.slice(0, input.limit), edges: edges.slice(0, input.limit) };
  }
  retrieve(t: string, input: RetrieveInput, scanLimit: number): RetrieveResult {
    const options: ListOptions = {
      ...input.filters,
      limit: scanLimit,
      includeDeleted: input.includeDeleted,
    };
    const records = (
      input.source === 'vertices'
        ? this.listVertices(t, options).items
        : this.listEdges(t, options).items
    ) as any[];
    const get = (record: any, path: string): Json => {
      const parts = path.split('.');
      const root = parts[0] as string;
      if (path.startsWith('data.') || path.startsWith('metadata.'))
        return (
          parts.slice(1).reduce((value: any, segment) => value?.[segment], record[root]) ?? null
        );
      return record[path] ?? null;
    };
    const projection = input.projection?.length ? input.projection : [{ field: 'id' }];
    const projected: Record<string, Json>[] = records.map((record) =>
      Object.fromEntries(
        projection.map((item) => [item.as ?? item.field, get(record, item.field)]),
      ),
    );
    let rows: Record<string, Json>[];
    if (input.groupBy?.length || input.aggregates?.length) {
      const groups = new Map<string, Record<string, Json>[]>();
      for (const row of projected) {
        const groupKey = JSON.stringify((input.groupBy ?? []).map((field) => row[field]));
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
      }
      rows = [...groups.values()].map((group) => {
        const out: Record<string, Json> = {};
        for (const field of input.groupBy ?? []) out[field] = group[0]![field] ?? null;
        for (const aggregate of input.aggregates ?? []) {
          const values = aggregate.field
            ? group.map((row) => Number(row[aggregate.field!])).filter(Number.isFinite)
            : [];
          out[aggregate.as] =
            aggregate.op === 'count'
              ? group.length
              : aggregate.op === 'sum'
                ? values.reduce((a, b) => a + b, 0)
                : aggregate.op === 'min'
                  ? Math.min(...values)
                  : aggregate.op === 'max'
                    ? Math.max(...values)
                    : values.reduce((a, b) => a + b, 0) / (values.length || 1);
        }
        return out;
      });
    } else rows = projected;
    for (const sort of (input.sort ?? []).reverse())
      rows.sort((a, b) => {
        const x = String(a[sort.field] ?? ''),
          y = String(b[sort.field] ?? '');
        return (x < y ? -1 : x > y ? 1 : 0) * (sort.direction === 'desc' ? -1 : 1);
      });
    return { rows: rows.slice(0, Math.min(input.limit ?? 100, 1000)), scanned: records.length };
  }
}
