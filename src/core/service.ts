import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import {
  DriftError,
  type ApiKey,
  type Edge,
  type Json,
  type ListOptions,
  type RetrieveInput,
  type Scope,
  type Tenant,
  type TraverseInput,
  type Vertex,
} from '../contracts/types.js';
import type { DriftRepository } from '../interfaces/repository.js';

export interface Principal {
  keyId: string;
  tenantId: string;
  scopes: Scope[];
}
const now = () => new Date().toISOString();
const has = (p: Principal, s: Scope) => p.scopes.includes('admin') || p.scopes.includes(s);
const requireScope = (p: Principal, s: Scope) => {
  if (!has(p, s)) throw new DriftError('forbidden', 'API key lacks required scope', 403);
};
const requireAdmin = (p: Principal) => {
  if (!p.scopes.includes('admin')) throw new DriftError('forbidden', 'Admin scope required', 403);
};
const hash = (secret: string) => {
  const salt = randomBytes(16);
  return `${salt.toString('base64url')}.${scryptSync(secret, salt, 32).toString('base64url')}`;
};
const verify = (secret: string, stored: string) => {
  const [salt, value] = stored.split('.');
  const expected = scryptSync(secret, Buffer.from(salt, 'base64url'), 32);
  return timingSafeEqual(expected, Buffer.from(value, 'base64url'));
};
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
    const [prefix, secret] = raw.split('.', 2);
    if (!prefix || !secret) throw new DriftError('unauthorized', 'Malformed API key', 401);
    const key = this.repo.findApiKeyByPrefix(prefix);
    if (!key || key.revokedAt || !verify(secret, key.secretHash))
      throw new DriftError('unauthorized', 'Invalid API key', 401);
    this.repo.touchApiKey(key.id, now());
    return { keyId: key.id, tenantId: key.tenantId, scopes: key.scopes };
  }
  private issueKey(tenantId: string, label: string, scopes: Scope[]) {
    const prefix = `drift_${randomBytes(6).toString('base64url')}`;
    const secret = randomBytes(32).toString('base64url');
    const at = now();
    const apiKey: ApiKey = {
      id: uuidv7(),
      tenantId,
      label,
      prefix,
      scopes: [...new Set(scopes)],
      createdAt: at,
      lastUsedAt: null,
      revokedAt: null,
    };
    this.repo.createApiKey({ ...apiKey, secretHash: hash(secret) });
    return { apiKey, secret: `${prefix}.${secret}` };
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
  createVertex(
    p: Principal,
    input: Omit<Vertex, 'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ) {
    requireScope(p, 'write');
    const at = now();
    const v: Vertex = {
      ...input,
      slug: input.slug ?? null,
      externalId: input.externalId ?? null,
      title: input.title ?? null,
      status: input.status ?? 'active',
      data: input.data ?? {},
      metadata: input.metadata ?? {},
      id: uuidv7(),
      tenantId: p.tenantId,
      version: 1,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
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
  createEdge(
    p: Principal,
    input: Omit<Edge, 'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ) {
    requireScope(p, 'write');
    active(this.repo.getVertex(p.tenantId, input.fromVertexId, false));
    active(this.repo.getVertex(p.tenantId, input.toVertexId, false));
    const at = now();
    const e: Edge = {
      ...input,
      id: uuidv7(),
      tenantId: p.tenantId,
      version: 1,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
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
    return this.repo.traverse(p.tenantId, input);
  }
  retrieve(p: Principal, input: RetrieveInput) {
    requireScope(p, 'read');
    if (input.includeDeleted) requireAdmin(p);
    if ((input.limit ?? 100) > 1000)
      throw new DriftError('limit_exceeded', 'Requested result limit exceeds server limit', 422);
    return this.repo.retrieve(p.tenantId, input, this.limits.retrieveScan);
  }
}
