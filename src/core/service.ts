import { v7 as uuidv7 } from 'uuid';
import {
  DriftError,
  defaultDriftLimits,
  type DriftLimits,
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
  private readonly limits: DriftLimits;

  constructor(
    private readonly repo: DriftRepository,
    limits: Partial<DriftLimits> = {},
    private readonly monotonicNow = () => performance.now(),
  ) {
    this.limits = { ...defaultDriftLimits, ...limits };
  }
  async close() {
    await this.repo.close();
  }
  async bootstrap(slug: string, name: string, label = 'bootstrap admin') {
    if (await this.repo.findTenantBySlug(slug))
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
    await this.repo.createTenant(tenant);
    const issued = await this.issueKey(tenant.id, label, ['admin']);
    return { tenant, key: issued };
  }
  async authenticate(raw: string): Promise<Principal> {
    const parsed = parseApiKey(raw);
    if (!parsed) throw new DriftError('unauthorized', 'Malformed API key', 401);
    const key = await this.repo.findApiKeyByPrefix(parsed.prefix);
    if (!key || key.revokedAt || !verifySecret(parsed.secret, key.secretHash))
      throw new DriftError('unauthorized', 'Invalid API key', 401);
    await this.repo.touchApiKey(key.id, now());
    return { keyId: key.id, tenantId: key.tenantId, scopes: key.scopes };
  }
  private async issueKey(
    tenantId: string,
    label: string,
    scopes: import('../contracts/types.js').Scope[],
  ) {
    const issued = createApiKey(tenantId, label, scopes, now());
    await this.repo.createApiKey({ ...issued.apiKey, secretHash: issued.secretHash });
    return { apiKey: issued.apiKey, secret: issued.secret };
  }
  async createKey(p: Principal, label: string, scopes: Scope[]) {
    requireAdmin(p);
    return this.issueKey(p.tenantId, label, scopes);
  }
  async listKeys(p: Principal) {
    requireAdmin(p);
    return await this.repo.listApiKeys(p.tenantId);
  }
  async revokeKey(p: Principal, id: string) {
    requireAdmin(p);
    if (!(await this.repo.revokeApiKey(p.tenantId, id, now())))
      throw new DriftError('not_found', 'API key not found or already revoked', 404);
  }
  async rotateKey(p: Principal, id: string, label: string, scopes: Scope[]) {
    requireAdmin(p);
    await this.revokeKey(p, id);
    return await this.issueKey(p.tenantId, label, scopes);
  }
  async createVertex(p: Principal, input: VertexInput) {
    requireScope(p, 'write');
    const v = createVertexRecord(p.tenantId, input, now());
    await this.repo.createVertex(v);
    return v;
  }
  async getVertex(p: Principal, id: string, includeDeleted = false) {
    requireScope(p, 'read');
    if (includeDeleted) requireAdmin(p);
    const v = await this.repo.getVertex(p.tenantId, id, includeDeleted);
    if (!v) throw new DriftError('not_found', 'Vertex not found', 404);
    return v;
  }
  async listVertices(p: Principal, o: ListOptions) {
    requireScope(p, 'read');
    if (o.includeDeleted) requireAdmin(p);
    return await this.repo.listVertices(p.tenantId, o);
  }
  async patchVertex(p: Principal, id: string, version: number, patch: Partial<Vertex>) {
    requireScope(p, 'write');
    const v = await this.repo.updateVertex(p.tenantId, id, version, patch, now());
    if (!v) throw new DriftError('conflict', 'Vertex was changed, deleted, or not found', 409);
    return v;
  }
  async deleteVertex(p: Principal, id: string, version: number) {
    requireScope(p, 'write');
    const v = await this.repo.softDeleteVertexWithEdges(p.tenantId, id, version, now());
    if (!v) throw new DriftError('conflict', 'Vertex was changed, deleted, or not found', 409);
    return v;
  }
  async restoreVertex(p: Principal, id: string, version: number) {
    requireAdmin(p);
    const v = await this.repo.restoreVertex(p.tenantId, id, version, now());
    if (!v) throw new DriftError('conflict', 'Vertex was changed, active, or not found', 409);
    return v;
  }
  async createEdge(p: Principal, input: EdgeInput) {
    requireScope(p, 'write');
    active(await this.repo.getVertex(p.tenantId, input.fromVertexId, false));
    active(await this.repo.getVertex(p.tenantId, input.toVertexId, false));
    const e = createEdgeRecord(p.tenantId, input, now());
    if (!(await this.repo.createEdge(e)))
      throw new DriftError('conflict', 'Edge endpoints changed or were deleted', 409);
    return e;
  }
  async getEdge(p: Principal, id: string, includeDeleted = false) {
    requireScope(p, 'read');
    if (includeDeleted) requireAdmin(p);
    const e = await this.repo.getEdge(p.tenantId, id, includeDeleted);
    if (!e) throw new DriftError('not_found', 'Edge not found', 404);
    return e;
  }
  async listEdges(p: Principal, o: ListOptions) {
    requireScope(p, 'read');
    if (o.includeDeleted) requireAdmin(p);
    return await this.repo.listEdges(p.tenantId, o);
  }
  async patchEdge(p: Principal, id: string, version: number, patch: Partial<Edge>) {
    requireScope(p, 'write');
    if (patch.fromVertexId)
      active(await this.repo.getVertex(p.tenantId, patch.fromVertexId, false));
    if (patch.toVertexId) active(await this.repo.getVertex(p.tenantId, patch.toVertexId, false));
    const e = await this.repo.updateEdge(p.tenantId, id, version, patch, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, deleted, or not found', 409);
    return e;
  }
  async deleteEdge(p: Principal, id: string, version: number) {
    requireScope(p, 'write');
    const e = await this.repo.softDeleteEdge(p.tenantId, id, version, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, deleted, or not found', 409);
    return e;
  }
  async restoreEdge(p: Principal, id: string, version: number) {
    requireAdmin(p);
    const prior = await this.repo.getEdge(p.tenantId, id, true);
    if (!prior) throw new DriftError('not_found', 'Edge not found', 404);
    active(await this.repo.getVertex(p.tenantId, prior.fromVertexId, false));
    active(await this.repo.getVertex(p.tenantId, prior.toVertexId, false));
    const e = await this.repo.restoreEdge(p.tenantId, id, version, now());
    if (!e) throw new DriftError('conflict', 'Edge was changed, active, or not found', 409);
    return e;
  }
  async traverse(p: Principal, input: TraverseInput) {
    requireScope(p, 'read');
    if (input.includeDeleted) requireAdmin(p);
    if (input.depth > this.limits.traverseDepth || input.limit > this.limits.traverseResults)
      throw new DriftError('limit_exceeded', 'Traversal exceeds server limits', 422);
    await this.getVertex(p, input.start, input.includeDeleted);
    return await traverseGraph(this.repo, p.tenantId, input);
  }
  async retrieve(p: Principal, input: RetrieveInput) {
    requireScope(p, 'read');
    if (input.includeDeleted) requireAdmin(p);
    if ((input.limit ?? 100) > this.limits.retrieveResults)
      throw new DriftError('limit_exceeded', 'Requested result limit exceeds server limit', 422);
    const startedAt = this.monotonicNow();
    const assertWithinBudget = () => {
      if (this.monotonicNow() - startedAt > this.limits.retrieveExecutionMs)
        throw new DriftError('limit_exceeded', 'Retrieval exceeds server execution budget', 422);
    };
    const options: ListOptions = {
      ...input.filters,
      limit: this.limits.retrieveScan,
      includeDeleted: input.includeDeleted,
    };
    const records =
      input.source === 'vertices'
        ? (await this.repo.listVertices(p.tenantId, options)).items
        : (await this.repo.listEdges(p.tenantId, options)).items;
    assertWithinBudget();
    return runRetrieval(records, input, {
      maxGroups: this.limits.retrieveGroups,
      maxResults: this.limits.retrieveResults,
      assertWithinBudget,
    });
  }
}
