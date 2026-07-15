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
} from '../../src/contracts/types.js';
import type { DriftRepository } from '../../src/interfaces/repository.js';

export class MockRepository implements DriftRepository {
  readonly tenants = new Map<string, Tenant>();
  readonly keys = new Map<string, ApiKey & { secretHash: string }>();
  readonly vertices = new Map<string, Vertex>();
  readonly edges = new Map<string, Edge>();
  readonly calls = { transaction: 0, createVertex: 0, createEdge: 0, traverse: 0, retrieve: 0 };
  transaction<T>(operation: () => T): T {
    this.calls.transaction++;
    return operation();
  }
  createTenant(tenant: Tenant) {
    this.tenants.set(tenant.slug, tenant);
  }
  findTenantBySlug(slug: string) {
    return this.tenants.get(slug) ?? null;
  }
  createApiKey(key: ApiKey & { secretHash: string }) {
    this.keys.set(key.prefix, key);
  }
  findApiKeyByPrefix(prefix: string) {
    return this.keys.get(prefix) ?? null;
  }
  touchApiKey(id: string, at: string) {
    for (const key of this.keys.values()) if (key.id === id) key.lastUsedAt = at;
  }
  listApiKeys(tenantId: string) {
    return [...this.keys.values()]
      .filter((key) => key.tenantId === tenantId)
      .map(({ secretHash: _, ...key }) => key);
  }
  revokeApiKey(tenantId: string, id: string, at: string) {
    for (const key of this.keys.values())
      if (key.tenantId === tenantId && key.id === id && !key.revokedAt) {
        key.revokedAt = at;
        return true;
      }
    return false;
  }
  createVertex(vertex: Vertex) {
    this.calls.createVertex++;
    this.vertices.set(vertex.id, vertex);
  }
  getVertex(tenantId: string, id: string, includeDeleted: boolean) {
    const vertex = this.vertices.get(id);
    return vertex?.tenantId === tenantId && (includeDeleted || !vertex.deletedAt) ? vertex : null;
  }
  listVertices(tenantId: string, options: ListOptions): Page<Vertex> {
    return {
      items: [...this.vertices.values()].filter(
        (v) => v.tenantId === tenantId && (options.includeDeleted || !v.deletedAt),
      ),
      nextCursor: null,
    };
  }
  updateVertex(tenantId: string, id: string, version: number, patch: Partial<Vertex>, at: string) {
    const vertex = this.getVertex(tenantId, id, false);
    if (!vertex || vertex.version !== version) return null;
    Object.assign(vertex, patch, { version: version + 1, updatedAt: at });
    return vertex;
  }
  softDeleteVertexWithEdges(tenantId: string, id: string, version: number, at: string) {
    const vertex = this.getVertex(tenantId, id, false);
    if (!vertex || vertex.version !== version) return null;
    Object.assign(vertex, { deletedAt: at, updatedAt: at, version: version + 1 });
    for (const edge of this.edges.values())
      if (
        edge.tenantId === tenantId &&
        !edge.deletedAt &&
        (edge.fromVertexId === id || edge.toVertexId === id)
      )
        Object.assign(edge, { deletedAt: at, updatedAt: at, version: edge.version + 1 });
    return vertex;
  }
  restoreVertex(tenantId: string, id: string, version: number, at: string) {
    const vertex = this.getVertex(tenantId, id, true);
    if (!vertex?.deletedAt || vertex.version !== version) return null;
    Object.assign(vertex, { deletedAt: null, updatedAt: at, version: version + 1 });
    return vertex;
  }
  createEdge(edge: Edge) {
    this.calls.createEdge++;
    this.edges.set(edge.id, edge);
  }
  getEdge(tenantId: string, id: string, includeDeleted: boolean) {
    const edge = this.edges.get(id);
    return edge?.tenantId === tenantId && (includeDeleted || !edge.deletedAt) ? edge : null;
  }
  listEdges(tenantId: string, options: ListOptions): Page<Edge> {
    return {
      items: [...this.edges.values()].filter(
        (e) => e.tenantId === tenantId && (options.includeDeleted || !e.deletedAt),
      ),
      nextCursor: null,
    };
  }
  updateEdge(tenantId: string, id: string, version: number, patch: Partial<Edge>, at: string) {
    const edge = this.getEdge(tenantId, id, false);
    if (!edge || edge.version !== version) return null;
    Object.assign(edge, patch, { version: version + 1, updatedAt: at });
    return edge;
  }
  softDeleteEdge(tenantId: string, id: string, version: number, at: string) {
    const edge = this.getEdge(tenantId, id, false);
    if (!edge || edge.version !== version) return null;
    Object.assign(edge, { deletedAt: at, updatedAt: at, version: version + 1 });
    return edge;
  }
  restoreEdge(tenantId: string, id: string, version: number, at: string) {
    const edge = this.getEdge(tenantId, id, true);
    if (!edge?.deletedAt || edge.version !== version) return null;
    Object.assign(edge, { deletedAt: null, updatedAt: at, version: version + 1 });
    return edge;
  }
  traverse(_tenantId: string, _input: TraverseInput): TraverseResult {
    this.calls.traverse++;
    return { vertices: [], edges: [] };
  }
  retrieve(_tenantId: string, _input: RetrieveInput, _scanLimit: number): RetrieveResult {
    this.calls.retrieve++;
    return { rows: [], scanned: 0 };
  }
}
