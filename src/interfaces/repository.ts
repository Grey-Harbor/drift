import type {
  ApiKey,
  Edge,
  ListOptions,
  Page,
  Tenant,
  TraverseInput,
  Vertex,
} from '../contracts/types.js';

export interface DriftRepository {
  close(): Promise<void>;
  createTenant(tenant: Tenant): Promise<void>;
  findTenantBySlug(slug: string): Promise<Tenant | null>;
  createApiKey(key: ApiKey & { secretHash: string }): Promise<void>;
  findApiKeyByPrefix(prefix: string): Promise<(ApiKey & { secretHash: string }) | null>;
  touchApiKey(id: string, at: string): Promise<void>;
  listApiKeys(tenantId: string): Promise<ApiKey[]>;
  revokeApiKey(tenantId: string, id: string, at: string): Promise<boolean>;
  createVertex(vertex: Vertex): Promise<void>;
  getVertex(tenantId: string, id: string, includeDeleted: boolean): Promise<Vertex | null>;
  listVertices(tenantId: string, options: ListOptions): Promise<Page<Vertex>>;
  updateVertex(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Vertex>,
    at: string,
  ): Promise<Vertex | null>;
  softDeleteVertexWithEdges(
    tenantId: string,
    id: string,
    version: number,
    at: string,
  ): Promise<Vertex | null>;
  restoreVertex(tenantId: string, id: string, version: number, at: string): Promise<Vertex | null>;
  createEdge(edge: Edge): Promise<boolean>;
  getEdge(tenantId: string, id: string, includeDeleted: boolean): Promise<Edge | null>;
  listEdges(tenantId: string, options: ListOptions): Promise<Page<Edge>>;
  updateEdge(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Edge>,
    at: string,
  ): Promise<Edge | null>;
  softDeleteEdge(tenantId: string, id: string, version: number, at: string): Promise<Edge | null>;
  restoreEdge(tenantId: string, id: string, version: number, at: string): Promise<Edge | null>;
  findConnectedEdges(
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
  ): Promise<Edge[]>;
}
