import type { PoolClient } from 'pg';
import type {
  ApiKey,
  Edge,
  ListOptions,
  Tenant,
  TraverseInput,
  Vertex,
} from '../../contracts/types.js';
import type { DriftRepository } from '../../interfaces/repository.js';
import { createPostgresPool, type PostgresPool, withTransaction } from './connection.js';
import { PostgresGraphStore } from './graph-store.js';
import {
  encodeJson,
  mapApiKey,
  mapEdge,
  mapEdgePatch,
  mapTenant,
  mapVertex,
  mapVertexPatch,
} from './mappers.js';
import { migrate } from './migrations.js';

export class PostgresDriftRepository implements DriftRepository {
  private readonly graph: PostgresGraphStore;

  private constructor(private readonly pool: PostgresPool) {
    this.graph = new PostgresGraphStore(pool);
  }

  static async open(connectionString: string) {
    const pool = createPostgresPool(connectionString);
    try {
      await migrate(pool);
      return new PostgresDriftRepository(pool);
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async close() {
    await this.pool.end();
  }

  async bootstrapTenant(tenant: Tenant, adminKey: ApiKey & { secretHash: string }) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO tenants(id,slug,name,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [tenant.id, tenant.slug, tenant.name, tenant.status, tenant.createdAt, tenant.updatedAt],
      );
      await insertApiKey(client, adminKey);
    });
  }

  async findTenantBySlug(slug: string) {
    const result = await this.pool.query('SELECT * FROM tenants WHERE slug=$1', [slug]);
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async createApiKey(value: ApiKey & { secretHash: string }) {
    await insertApiKey(this.pool, value);
  }

  async findApiKeyByPrefix(prefix: string) {
    const result = await this.pool.query('SELECT * FROM api_keys WHERE prefix=$1', [prefix]);
    return result.rows[0] ? mapApiKey(result.rows[0]) : null;
  }

  async touchApiKey(id: string, at: string) {
    await this.pool.query('UPDATE api_keys SET last_used_at=$1 WHERE id=$2', [at, id]);
  }

  async listApiKeys(tenantId: string) {
    const result = await this.pool.query(
      'SELECT * FROM api_keys WHERE tenant_id=$1 ORDER BY created_at DESC',
      [tenantId],
    );
    return result.rows.map(mapApiKey).map(({ secretHash: _, ...value }) => value);
  }

  async revokeApiKey(tenantId: string, id: string, at: string) {
    const result = await this.pool.query(
      `UPDATE api_keys SET revoked_at=$1
       WHERE tenant_id=$2 AND id::text=$3 AND revoked_at IS NULL`,
      [at, tenantId, id],
    );
    return result.rowCount === 1;
  }

  async rotateApiKey(
    tenantId: string,
    id: string,
    replacement: ApiKey & { secretHash: string },
    at: string,
  ) {
    return await withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE api_keys SET revoked_at=$1
         WHERE tenant_id=$2 AND id::text=$3 AND revoked_at IS NULL`,
        [at, tenantId, id],
      );
      if (result.rowCount !== 1) return false;
      await insertApiKey(client, replacement);
      return true;
    });
  }

  async createVertex(value: Vertex) {
    await this.pool.query(
      `INSERT INTO vertices(id,tenant_id,type,slug,external_id,title,status,data,metadata,version,created_at,updated_at,deleted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13)`,
      [
        value.id,
        value.tenantId,
        value.type,
        value.slug,
        value.externalId,
        value.title,
        value.status,
        encodeJson(value.data),
        encodeJson(value.metadata),
        value.version,
        value.createdAt,
        value.updatedAt,
        value.deletedAt,
      ],
    );
  }

  async getVertex(tenantId: string, id: string, includeDeleted: boolean) {
    const result = await this.pool.query(
      `SELECT * FROM vertices WHERE tenant_id=$1 AND id::text=$2 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      [tenantId, id],
    );
    return result.rows[0] ? mapVertex(result.rows[0]) : null;
  }

  async listVertices(tenantId: string, options: ListOptions) {
    return await this.graph.list('vertices', mapVertex, tenantId, options);
  }

  async updateVertex(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Vertex>,
    at: string,
  ) {
    return await this.graph.update(
      'vertices',
      mapVertex,
      tenantId,
      id,
      version,
      mapVertexPatch(patch),
      at,
    );
  }

  async softDeleteVertexWithEdges(tenantId: string, id: string, version: number, at: string) {
    return await withTransaction(this.pool, async (client) => {
      const vertex = await client.query(
        `UPDATE vertices SET deleted_at=$1,updated_at=$1,version=version+1
         WHERE tenant_id=$2 AND id::text=$3 AND deleted_at IS NULL AND version=$4
         RETURNING *`,
        [at, tenantId, id, version],
      );
      if (!vertex.rows[0]) return null;
      await client.query(
        `UPDATE edges SET deleted_at=$1,updated_at=$1,version=version+1
         WHERE tenant_id=$2 AND deleted_at IS NULL
           AND (from_vertex_id=$3 OR to_vertex_id=$3)`,
        [at, tenantId, id],
      );
      return mapVertex(vertex.rows[0]);
    });
  }

  async restoreVertex(tenantId: string, id: string, version: number, at: string) {
    const result = await this.pool.query(
      `UPDATE vertices SET deleted_at=NULL,updated_at=$1,version=version+1
       WHERE tenant_id=$2 AND id::text=$3 AND deleted_at IS NOT NULL AND version=$4
       RETURNING *`,
      [at, tenantId, id, version],
    );
    return result.rows[0] ? mapVertex(result.rows[0]) : null;
  }

  async createEdge(value: Edge) {
    return await withTransaction(this.pool, async (client) => {
      if (
        !(await lockActiveEndpoints(client, value.tenantId, value.fromVertexId, value.toVertexId))
      )
        return false;
      await client.query(
        `INSERT INTO edges(id,tenant_id,from_vertex_id,to_vertex_id,type,status,data,metadata,version,created_at,updated_at,deleted_at)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
        [
          value.id,
          value.tenantId,
          value.fromVertexId,
          value.toVertexId,
          value.type,
          value.status,
          encodeJson(value.data),
          encodeJson(value.metadata),
          value.version,
          value.createdAt,
          value.updatedAt,
          value.deletedAt,
        ],
      );
      return true;
    });
  }

  async getEdge(tenantId: string, id: string, includeDeleted: boolean) {
    const result = await this.pool.query(
      `SELECT * FROM edges WHERE tenant_id=$1 AND id::text=$2 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      [tenantId, id],
    );
    return result.rows[0] ? mapEdge(result.rows[0]) : null;
  }

  async listEdges(tenantId: string, options: ListOptions) {
    return await this.graph.list('edges', mapEdge, tenantId, options);
  }

  async updateEdge(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Edge>,
    at: string,
  ) {
    if (!patch.fromVertexId && !patch.toVertexId)
      return await this.graph.update(
        'edges',
        mapEdge,
        tenantId,
        id,
        version,
        mapEdgePatch(patch),
        at,
      );

    return await withTransaction(this.pool, async (client) => {
      const currentResult = await client.query(
        `SELECT * FROM edges
         WHERE tenant_id=$1 AND id::text=$2 AND deleted_at IS NULL AND version=$3`,
        [tenantId, id, version],
      );
      if (!currentResult.rows[0]) return null;
      const current = mapEdge(currentResult.rows[0]);
      const from = patch.fromVertexId ?? current.fromVertexId;
      const to = patch.toVertexId ?? current.toVertexId;
      if (!(await lockActiveEndpoints(client, tenantId, from, to))) return null;
      return await new PostgresGraphStore(client).update(
        'edges',
        mapEdge,
        tenantId,
        id,
        version,
        mapEdgePatch(patch),
        at,
      );
    });
  }

  async softDeleteEdge(tenantId: string, id: string, version: number, at: string) {
    const result = await this.pool.query(
      `UPDATE edges SET deleted_at=$1,updated_at=$1,version=version+1
       WHERE tenant_id=$2 AND id::text=$3 AND deleted_at IS NULL AND version=$4
       RETURNING *`,
      [at, tenantId, id, version],
    );
    return result.rows[0] ? mapEdge(result.rows[0]) : null;
  }

  async restoreEdge(tenantId: string, id: string, version: number, at: string) {
    return await withTransaction(this.pool, async (client) => {
      const priorResult = await client.query(
        `SELECT * FROM edges
         WHERE tenant_id=$1 AND id::text=$2 AND deleted_at IS NOT NULL AND version=$3`,
        [tenantId, id, version],
      );
      if (!priorResult.rows[0]) return null;
      const prior = mapEdge(priorResult.rows[0]);
      if (!(await lockActiveEndpoints(client, tenantId, prior.fromVertexId, prior.toVertexId)))
        return null;
      const result = await client.query(
        `UPDATE edges SET deleted_at=NULL,updated_at=$1,version=version+1
         WHERE tenant_id=$2 AND id::text=$3 AND deleted_at IS NOT NULL AND version=$4
         RETURNING *`,
        [at, tenantId, id, version],
      );
      return result.rows[0] ? mapEdge(result.rows[0]) : null;
    });
  }

  async findConnectedEdges(
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
    limit: number,
  ) {
    return await this.graph.findConnected(
      mapEdge,
      tenantId,
      vertexIds,
      direction,
      edgeTypes,
      includeDeleted,
      limit,
    );
  }
}

async function insertApiKey(db: PostgresPool | PoolClient, value: ApiKey & { secretHash: string }) {
  await db.query(
    `INSERT INTO api_keys(id,tenant_id,label,prefix,secret_hash,scopes,created_at,last_used_at,revoked_at)
     VALUES($1,$2,$3,$4,$5,$6::text[],$7,$8,$9)`,
    [
      value.id,
      value.tenantId,
      value.label,
      value.prefix,
      value.secretHash,
      value.scopes,
      value.createdAt,
      value.lastUsedAt,
      value.revokedAt,
    ],
  );
}

async function lockActiveEndpoints(
  client: PoolClient,
  tenantId: string,
  fromVertexId: string,
  toVertexId: string,
) {
  const ids = [...new Set([fromVertexId, toVertexId])].sort();
  const result = await client.query(
    `SELECT id FROM vertices
     WHERE tenant_id=$1 AND id::text=ANY($2::text[]) AND deleted_at IS NULL
     ORDER BY id::text FOR UPDATE`,
    [tenantId, ids],
  );
  return result.rowCount === ids.length;
}
