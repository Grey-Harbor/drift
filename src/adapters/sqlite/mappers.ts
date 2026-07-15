import type { ApiKey, Edge, Json, Tenant, Vertex } from '../../contracts/types.js';

type Row = Record<string, unknown>;

export const decodeJson = (value: unknown): Json => JSON.parse(String(value)) as Json;
export const encodeJson = (value: unknown) => JSON.stringify(value);

export function mapTenant(value: unknown): Tenant {
  const row = value as Row;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapApiKey(value: unknown): ApiKey & { secretHash: string } {
  const row = value as Row;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    label: String(row.label),
    prefix: String(row.prefix),
    scopes: decodeJson(row.scopes) as ApiKey['scopes'],
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at as string | null,
    revokedAt: row.revoked_at as string | null,
    secretHash: String(row.secret_hash),
  };
}

export function mapVertex(value: unknown): Vertex {
  const row = value as Row;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: String(row.type),
    slug: row.slug as string | null,
    externalId: row.external_id as string | null,
    title: row.title as string | null,
    status: String(row.status),
    data: decodeJson(row.data),
    metadata: decodeJson(row.metadata),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at as string | null,
  };
}

export function mapEdge(value: unknown): Edge {
  const row = value as Row;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    fromVertexId: String(row.from_vertex_id),
    toVertexId: String(row.to_vertex_id),
    type: String(row.type),
    status: String(row.status),
    data: decodeJson(row.data),
    metadata: decodeJson(row.metadata),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at as string | null,
  };
}

export function mapVertexPatch(patch: Partial<Vertex>): Record<string, unknown> {
  return mapPatch(patch, ['type', 'slug', 'externalId', 'title', 'status', 'data', 'metadata']);
}

export function mapEdgePatch(patch: Partial<Edge>): Record<string, unknown> {
  return mapPatch(patch, ['fromVertexId', 'toVertexId', 'type', 'status', 'data', 'metadata']);
}

function mapPatch(
  patch: Record<string, unknown>,
  allowedFields: string[],
): Record<string, unknown> {
  const columnNames: Record<string, string> = {
    externalId: 'external_id',
    fromVertexId: 'from_vertex_id',
    toVertexId: 'to_vertex_id',
  };
  const columns: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!allowedFields.includes(field)) continue;
    columns[columnNames[field] ?? field] =
      field === 'data' || field === 'metadata' ? encodeJson(value) : value;
  }
  return columns;
}

export const encodeCursor = (id: string) => Buffer.from(id).toString('base64url');
export const decodeCursor = (value?: string) =>
  value ? Buffer.from(value, 'base64url').toString() : undefined;
