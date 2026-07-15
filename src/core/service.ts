import { v7 as uuidv7 } from 'uuid';
import {
  DriftError,
  type Edge,
  type ListOptions,
  type RetrieveInput,
  type Scope,
  type Tenant,
  type TraverseInput,
  type Vertex,
} from '../contracts/types.js';
import type { DriftRepository } from '../interfaces/repository.js';
import { createApiKey, parseApiKey, verifySecret } from './api-keys.js';
import { requireAdmin, requireScope, type Principal } from './authorization.js';
import {
  createEdgeRecord,
  createVertexRecord,
  type EdgeInput,
  type VertexInput,
} from './record-factories.js';
import { runRetrieval } from './retrieval.js';
import { traverseGraph } from './traversal.js';

export type { Principal } from './authorization.js';
const now = () => new Date().toISOString();
const active = (v: Vertex | null) => {
  if (!v) throw new DriftError('not_found', 'Active vertex not found', 404);
  return v;
};

export class DriftService {
  constructor(
    private readonly repo: DriftRepository,
    private readonly limits = { traverseDepth: 5, traverseResults: 500, retrieveScan: 5000 },
  ) {}
  bootstrap(slug: string, name: string, label = 'bootstrap admin') {
    if (this.repo.findTenantBySlug(slug))
      throw new DriftError('conflict', 'Tenant slug already exists', 409);
    const at = now();
    const tenant: Tenant = {
      id: uuidv7(),
      slug,
      name,
      status: 'active',
      createdAt: at,
      updatedAt: at,
    };
    this.repo.createTenant(tenant);
    const issued = this.issueKey(tenant.id, label, ['admin']);
    return { tenant, key: issued };
  }
  authenticate(raw: string): Principal {
    const parsed = parseApiKey(raw);
    if (!parsed) throw new DriftError('unauthorized', 'Malformed API key', 401);
    const key = this.repo.findApiKeyByPrefix(parsed.prefix);
    if (!key || key.revokedAt || !verifySecret(parsed.secret, key.secretHash))
      throw new DriftError('unauthorized', 'Invalid API key', 401);
    this.repo.touchApiKey(key.id, now());
    return { keyId: key.id, tenantId: key.tenantId, scopes: key.scopes };
  }
  private issueKey(
    tenantId: string,
    label: string,
    scopes: import('../contracts/types.js').Scope[],
  ) {
    const issued = createApiKey(tenantId, label, scopes, now());
    this.repo.createApiKey({ ...issued.apiKey, secretHash: issued.secretHash });
    return { apiKey: issued.apiKey, secret: issued.secret };
  }
  createKey(p: Principal, label: string, scopes: Scope[]) {
    requireAdmin(p);
    return this.issueKey(p.tenantId, label, scopes);
  }
  listKeys(p: Principal) {
    requireAdmin(p);
    return this.repo.listApiKeys(p.tenantId);
  }
  revokeKey(p: Principal, id: string) {
    requireAdmin(p);
    if (!this.repo.revokeApiKey(p.tenantId, id, now()))
      throw new DriftError('not_found', 'API key not found or already revoked', 404);
  }
  rotateKey(p: Principal, id: string, label: string, scopes: Scope[]) {
    requireAdmin(p);
    this.revokeKey(p, id);
    return this.issueKey(p.tenantId, label, scopes);
  }
  createVertex(p: Principal, input: VertexInput) {
    requireScope(p, 'write');
    const v = createVertexRecord(p.tenantId, input, now());
    this.repo.createVertex(v);
    return v;
  }
  getVertex(p: Principal, id: string, includeDeleted = false) {
    requireScope(p, 'read');
    if (includeDeleted) requireAdmin(p);
    const v = this.repo.getVertex(p.tenantId, id, includeDeleted);
    if (!v) throw new DriftError('not_found', 'Vertex not found', 404);
    return v;
  }
  listVertices(p: Principal, o: ListOptions) {
    requireScope(p, 'read');
    if (o.includeDeleted) requireAdmin(p);
    return this.repo.listVertices(p.tenantId, o);
  }
  patchVertex(p: Principal, id: string, version: number, patch: Partial<Vertex>) {
    requireScope(p, 'write');
    const v = this.repo.updateVertex(p.tenantId, id, version, patch, now());
    if (!v) throw new DriftError('conflict', 'Vertex was changed, deleted, or not found', 409);
    return v;
  }
  deleteVertex(p: Principal, id: string, version: number) {
    requireScope(p, 'write');
    const v = this.repo.transaction(() =>
      this.repo.softDeleteVertexWithEdges(p.tenantId, id, version, now()),
    );
    if (!v) throw new DriftError('conflict', 'Vertex was changed, deleted, or not found', 409);
    return v;
  }
  restoreVertex(p: Principal, id: string, version: number) {
    requireAdmin(p);
    const v = this.repo.restoreVertex(p.tenantId, id, version, now());
    if (!v) throw new DriftError('conflict', 'Vertex was changed, active, or not found', 409);
    return v;
  }
  createEdge(p: Principal, input: EdgeInput) {
    requireScope(p, 'write');
    active(this.repo.getVertex(p.tenantId, input.fromVertexId, false));
    active(this.repo.getVertex(p.tenantId, input.toVertexId, false));
    const e = createEdgeRecord(p.tenantId, input, now());
    this.repo.createEdge(e);
    return e;
  }
  getEdge(p: Principal, id: string, includeDeleted = false) {
    requireScope(p, 'read');
    if (includeDeleted) requireAdmin(p);
    const e = this.repo.getEdge(p.tenantId, id, includeDeleted);
    if (!e) throw new DriftError('not_found', 'Edge not found', 404);
    return e;
  }
  listEdges(p: Principal, o: ListOptions) {
    requireScope(p, 'read');
    if (o.includeDeleted) requireAdmin(p);
    return this.repo.listEdges(p.tenantId, o);
  }
  patchEdge(p: Principal, id: string, version: number, patch: Partial<Edge>) {
    requireScope(p, 'write');
    if (patch.fromVertexId) active(this.repo.getVertex(p.tenantId, patch.fromVertexId, false));
    if (patch.toVertexId) active(this.repo.getVertex(p.tenantId, patch.toVertexId, false));
    const e = this.repo.updateEdge(p.tenantId, id, version, patch, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, deleted, or not found', 409);
    return e;
  }
  deleteEdge(p: Principal, id: string, version: number) {
    requireScope(p, 'write');
    const e = this.repo.softDeleteEdge(p.tenantId, id, version, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, deleted, or not found', 409);
    return e;
  }
  restoreEdge(p: Principal, id: string, version: number) {
    requireAdmin(p);
    const prior = this.repo.getEdge(p.tenantId, id, true);
    if (!prior) throw new DriftError('not_found', 'Edge not found', 404);
    active(this.repo.getVertex(p.tenantId, prior.fromVertexId, false));
    active(this.repo.getVertex(p.tenantId, prior.toVertexId, false));
    const e = this.repo.restoreEdge(p.tenantId, id, version, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, active, or not found', 409);
    return e;
  }
  traverse(p: Principal, input: TraverseInput) {
    requireScope(p, 'read');
    if (input.includeDeleted) requireAdmin(p);
    if (input.depth > this.limits.traverseDepth || input.limit > this.limits.traverseResults)
      throw new DriftError('limit_exceeded', 'Traversal exceeds server limits', 422);
    this.getVertex(p, input.start, input.includeDeleted);
    return traverseGraph(this.repo, p.tenantId, input);
  }
  retrieve(p: Principal, input: RetrieveInput) {
    requireScope(p, 'read');
    if (input.includeDeleted) requireAdmin(p);
    if ((input.limit ?? 100) > 1000)
      throw new DriftError('limit_exceeded', 'Requested result limit exceeds server limit', 422);
    const options: ListOptions = {
      ...input.filters,
      limit: this.limits.retrieveScan,
      includeDeleted: input.includeDeleted,
    };
    const records =
      input.source === 'vertices'
        ? this.repo.listVertices(p.tenantId, options).items
        : this.repo.listEdges(p.tenantId, options).items;
    return runRetrieval(records, input);
  }
}
