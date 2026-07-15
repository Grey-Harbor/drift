import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ApiKey,
  Edge,
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
import {
  decodeCursor,
  encodeCursor,
  encodeJson,
  mapApiKey,
  mapEdge,
  mapTenant,
  mapVertex,
} from './mappers.js';
import { runRetrieval } from './retrieval.js';

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
    return r ? mapTenant(r) : null;
  }
  createApiKey(v: ApiKey & { secretHash: string }) {
    this.db
      .prepare(
        'INSERT INTO api_keys VALUES (@id,@tenantId,@label,@prefix,@secretHash,@scopes,@createdAt,@lastUsedAt,@revokedAt)',
      )
      .run({ ...v, scopes: encodeJson(v.scopes) });
  }
  findApiKeyByPrefix(prefix: string) {
    const r = this.db.prepare('SELECT * FROM api_keys WHERE prefix=?').get(prefix);
    return r ? mapApiKey(r) : null;
  }
  touchApiKey(id: string, at: string) {
    this.db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(at, id);
  }
  listApiKeys(tenantId: string) {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE tenant_id=? ORDER BY created_at DESC')
      .all(tenantId)
      .map(mapApiKey)
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
      .run({ ...v, data: encodeJson(v.data), metadata: encodeJson(v.metadata) });
  }
  getVertex(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM vertices WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? mapVertex(r) : null;
  }
  listVertices(t: string, o: ListOptions) {
    return this.list('vertices', mapVertex, t, o);
  }
  updateVertex(t: string, id: string, version: number, p: Partial<Vertex>, at: string) {
    return this.update('vertices', mapVertex, t, id, version, p, at);
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
    return mapVertex(v);
  }
  restoreVertex(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE vertices SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
      )
      .get(at, t, id, version);
    return r ? mapVertex(r) : null;
  }
  createEdge(v: Edge) {
    this.db
      .prepare(
        'INSERT INTO edges VALUES (@id,@tenantId,@fromVertexId,@toVertexId,@type,@status,@data,@metadata,@version,@createdAt,@updatedAt,@deletedAt)',
      )
      .run({ ...v, data: encodeJson(v.data), metadata: encodeJson(v.metadata) });
  }
  getEdge(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM edges WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? mapEdge(r) : null;
  }
  listEdges(t: string, o: ListOptions) {
    return this.list('edges', mapEdge, t, o);
  }
  updateEdge(t: string, id: string, version: number, p: Partial<Edge>, at: string) {
    return this.update('edges', mapEdge, t, id, version, p, at);
  }
  softDeleteEdge(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE edges SET deleted_at=?,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=? RETURNING *',
      )
      .get(at, at, t, id, version);
    return r ? mapEdge(r) : null;
  }
  restoreEdge(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE edges SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
      )
      .get(at, t, id, version);
    return r ? mapEdge(r) : null;
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
    const c = decodeCursor(o.cursor);
    if (c) {
      where.push('id>@cursor');
      params.cursor = c;
    }
    const rows = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT @limit`)
      .all(params);
    const items = rows.slice(0, o.limit).map(map);
    return {
      items,
      nextCursor: rows.length > o.limit ? encodeCursor((items.at(-1) as any).id) : null,
    };
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
        columns[c[k] ?? k] = k === 'data' || k === 'metadata' ? encodeJson(v) : v;
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
        .map(mapEdge);
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
    const records =
      input.source === 'vertices'
        ? this.listVertices(t, options).items
        : this.listEdges(t, options).items;
    return runRetrieval(records, input);
  }
}
