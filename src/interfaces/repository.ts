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
  transaction<T>(operation: () => T): T;
  createTenant(tenant: Tenant): void;
  findTenantBySlug(slug: string): Tenant | null;
  createApiKey(key: ApiKey & { secretHash: string }): void;
  findApiKeyByPrefix(prefix: string): (ApiKey & { secretHash: string }) | null;
  touchApiKey(id: string, at: string): void;
  listApiKeys(tenantId: string): ApiKey[];
  revokeApiKey(tenantId: string, id: string, at: string): boolean;
  createVertex(vertex: Vertex): void;
  getVertex(tenantId: string, id: string, includeDeleted: boolean): Vertex | null;
  listVertices(tenantId: string, options: ListOptions): Page<Vertex>;
  updateVertex(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Vertex>,
    at: string,
  ): Vertex | null;
  softDeleteVertexWithEdges(
    tenantId: string,
    id: string,
    version: number,
    at: string,
  ): Vertex | null;
  restoreVertex(tenantId: string, id: string, version: number, at: string): Vertex | null;
  createEdge(edge: Edge): void;
  getEdge(tenantId: string, id: string, includeDeleted: boolean): Edge | null;
  listEdges(tenantId: string, options: ListOptions): Page<Edge>;
  updateEdge(
    tenantId: string,
    id: string,
    version: number,
    patch: Partial<Edge>,
    at: string,
  ): Edge | null;
  softDeleteEdge(tenantId: string, id: string, version: number, at: string): Edge | null;
  restoreEdge(tenantId: string, id: string, version: number, at: string): Edge | null;
  findConnectedEdges(
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
  ): Edge[];
}
