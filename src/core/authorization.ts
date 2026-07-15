import { DriftError, type Scope } from '../contracts/types.js';

export interface Principal {
  keyId: string;
  tenantId: string;
  scopes: Scope[];
}

export function requireScope(principal: Principal, scope: Scope) {
  if (principal.scopes.includes('admin') || principal.scopes.includes(scope)) return;
  throw new DriftError('forbidden', 'API key lacks required scope', 403);
}

export function requireAdmin(principal: Principal) {
  if (principal.scopes.includes('admin')) return;
  throw new DriftError('forbidden', 'Admin scope required', 403);
}
