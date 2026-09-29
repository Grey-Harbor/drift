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
  async close() {
    this.db.close();
  }
  async bootstrapTenant(tenant: Tenant, adminKey: ApiKey & { secretHash: string }) {
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO tenants VALUES (@id,@slug,@name,@status,@createdAt,@updatedAt)')
        .run(tenant);
      insertApiKey(this.db, adminKey);
    })();
  }
  async findTenantBySlug(slug: string) {
    const r = this.db.prepare('SELECT * FROM tenants WHERE slug=?').get(slug);
    return r ? mapTenant(r) : null;
  }
  async createApiKey(v: ApiKey & { secretHash: string }) {
    insertApiKey(this.db, v);
  }
  async findApiKeyByPrefix(prefix: string) {
    const r = this.db.prepare('SELECT * FROM api_keys WHERE prefix=?').get(prefix);
    return r ? mapApiKey(r) : null;
  }
  async touchApiKey(id: string, at: string) {
    this.db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(at, id);
  }
  async listApiKeys(tenantId: string) {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE tenant_id=? ORDER BY created_at DESC')
      .all(tenantId)
      .map(mapApiKey)
      .map(({ secretHash, ...v }) => v);
  }
  async revokeApiKey(tenantId: string, id: string, at: string) {
    return (
      this.db
        .prepare(
          'UPDATE api_keys SET revoked_at=? WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
        )
        .run(at, tenantId, id).changes === 1
    );
  }
  async rotateApiKey(
    tenantId: string,
    id: string,
    replacement: ApiKey & { secretHash: string },
    at: string,
  ) {
    return this.db.transaction(() => {
      const changed = this.db
        .prepare(
          'UPDATE api_keys SET revoked_at=? WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
        )
        .run(at, tenantId, id).changes;
      if (changed !== 1) return false;
      insertApiKey(this.db, replacement);
      return true;
    })();
  }
  async createVertex(v: Vertex) {
    this.db
      .prepare(
        'INSERT INTO vertices VALUES (@id,@tenantId,@type,@slug,@externalId,@title,@status,@data,@metadata,@version,@createdAt,@updatedAt,@deletedAt)',
      )
      .run({ ...v, data: encodeJson(v.data), metadata: encodeJson(v.metadata) });
  }
  async getVertex(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM vertices WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? mapVertex(r) : null;
  }
  async listVertices(t: string, o: ListOptions) {
    return this.graph.list('vertices', mapVertex, t, o);
  }
  async updateVertex(t: string, id: string, version: number, p: Partial<Vertex>, at: string) {
    return this.graph.update('vertices', mapVertex, t, id, version, mapVertexPatch(p), at, () => {
      const row = this.db
        .prepare(
          'SELECT * FROM vertices WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=?',
        )
        .get(t, id, version);
      return row ? mapVertex(row) : null;
    });
  }
  async softDeleteVertexWithEdges(t: string, id: string, version: number, at: string) {
    return this.db.transaction(() => {
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
    })();
  }
  async restoreVertex(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE vertices SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
      )
      .get(at, t, id, version);
    return r ? mapVertex(r) : null;
  }
  async createEdge(v: Edge) {
    return this.db.transaction(() => {
      if (!hasActiveEndpoints(this.db, v.tenantId, v.fromVertexId, v.toVertexId)) return false;
      this.db
        .prepare(
          'INSERT INTO edges VALUES (@id,@tenantId,@fromVertexId,@toVertexId,@type,@status,@data,@metadata,@version,@createdAt,@updatedAt,@deletedAt)',
        )
        .run({ ...v, data: encodeJson(v.data), metadata: encodeJson(v.metadata) });
      return true;
    })();
  }
  async getEdge(t: string, id: string, deleted: boolean) {
    const r = this.db
      .prepare(
        `SELECT * FROM edges WHERE tenant_id=? AND id=? ${deleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(t, id);
    return r ? mapEdge(r) : null;
  }
  async listEdges(t: string, o: ListOptions) {
    return this.graph.list('edges', mapEdge, t, o);
  }
  async updateEdge(t: string, id: string, version: number, p: Partial<Edge>, at: string) {
    if (p.fromVertexId || p.toVertexId)
      return this.db.transaction(() => {
        const row = this.db
          .prepare(
            'SELECT * FROM edges WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=?',
          )
          .get(t, id, version);
        if (!row) return null;
        const current = mapEdge(row);
        if (
          !hasActiveEndpoints(
            this.db,
            t,
            p.fromVertexId ?? current.fromVertexId,
            p.toVertexId ?? current.toVertexId,
          )
        )
          return null;
        return this.graph.update('edges', mapEdge, t, id, version, mapEdgePatch(p), at, () =>
          mapEdge(row),
        );
      })();
    return this.graph.update('edges', mapEdge, t, id, version, mapEdgePatch(p), at, () => {
      const row = this.db
        .prepare(
          'SELECT * FROM edges WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=?',
        )
        .get(t, id, version);
      return row ? mapEdge(row) : null;
    });
  }
  async softDeleteEdge(t: string, id: string, version: number, at: string) {
    const r = this.db
      .prepare(
        'UPDATE edges SET deleted_at=?,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND version=? RETURNING *',
      )
      .get(at, at, t, id, version);
    return r ? mapEdge(r) : null;
  }
  async restoreEdge(t: string, id: string, version: number, at: string) {
    return this.db.transaction(() => {
      const priorRow = this.db
        .prepare(
          'SELECT * FROM edges WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=?',
        )
        .get(t, id, version);
      if (!priorRow) return null;
      const prior = mapEdge(priorRow);
      if (!hasActiveEndpoints(this.db, t, prior.fromVertexId, prior.toVertexId)) return null;
      const row = this.db
        .prepare(
          'UPDATE edges SET deleted_at=NULL,updated_at=?,version=version+1 WHERE tenant_id=? AND id=? AND deleted_at IS NOT NULL AND version=? RETURNING *',
        )
        .get(at, t, id, version);
      return row ? mapEdge(row) : null;
    })();
  }
  async findConnectedEdges(
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
  ): Promise<Edge[]> {
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

function insertApiKey(db: Database.Database, value: ApiKey & { secretHash: string }) {
  db.prepare(
    'INSERT INTO api_keys VALUES (@id,@tenantId,@label,@prefix,@secretHash,@scopes,@createdAt,@lastUsedAt,@revokedAt)',
  ).run({ ...value, scopes: encodeJson(value.scopes) });
}

function hasActiveEndpoints(
  db: Database.Database,
  tenantId: string,
  fromVertexId: string,
  toVertexId: string,
) {
  const activeEndpoints = db
    .prepare(
      'SELECT COUNT(*) AS count FROM vertices WHERE tenant_id=? AND id IN (?,?) AND deleted_at IS NULL',
    )
    .get(tenantId, fromVertexId, toVertexId) as { count: number };
  return activeEndpoints.count === (fromVertexId === toVertexId ? 1 : 2);
}
