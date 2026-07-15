import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ApiKey,
  Edge,
  ListOptions,
  Page,
  Tenant,
  TraverseInput,
  Vertex,
} from '../../contracts/types.js';
import type { DriftRepository } from '../../interfaces/repository.js';
import { migrate } from './migrations.js';
import {
  encodeJson,
  mapApiKey,
  mapEdge,
  mapEdgePatch,
  mapTenant,
  mapVertex,
  mapVertexPatch,
} from './mappers.js';
import { SqliteGraphStore } from './graph-store.js';

export class SqliteDriftRepository implements DriftRepository {
  readonly db: Database.Database;
  private readonly graph: SqliteGraphStore;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    migrate(this.db);
    this.graph = new SqliteGraphStore(this.db);
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
    return this.graph.list('vertices', mapVertex, t, o);
  }
  updateVertex(t: string, id: string, version: number, p: Partial<Vertex>, at: string) {
    return this.graph.update('vertices', mapVertex, t, id, version, mapVertexPatch(p), at, () =>
      this.getVertex(t, id, true),
    );
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
    return this.graph.list('edges', mapEdge, t, o);
  }
  updateEdge(t: string, id: string, version: number, p: Partial<Edge>, at: string) {
    return this.graph.update('edges', mapEdge, t, id, version, mapEdgePatch(p), at, () =>
      this.getEdge(t, id, true),
    );
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
  findConnectedEdges(
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
  ): Edge[] {
    return this.graph.findConnected(
      mapEdge,
      tenantId,
      vertexIds,
      direction,
      edgeTypes,
      includeDeleted,
    );
  }
}
