import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type { ApiKey, Scope } from '../contracts/types.js';

export function createApiKey(tenantId: string, label: string, scopes: Scope[], createdAt: string) {
  const prefix = `drift_${randomBytes(6).toString('base64url')}`;
  const secret = randomBytes(32).toString('base64url');
  const apiKey: ApiKey = {
    id: uuidv7(),
    tenantId,
    label,
    prefix,
    scopes: [...new Set(scopes)],
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  };

  return { apiKey, secret: `${prefix}.${secret}`, secretHash: hashSecret(secret) };
}

export function parseApiKey(raw: string) {
  const [prefix, secret] = raw.split('.', 2);
  return prefix && secret ? { prefix, secret } : null;
}

export function hashSecret(secret: string) {
  const salt = randomBytes(16);
  return `${salt.toString('base64url')}.${scryptSync(secret, salt, 32).toString('base64url')}`;
}

export function verifySecret(secret: string, stored: string) {
  const [salt, value] = stored.split('.');
  if (!salt || !value) return false;
  const expected = scryptSync(secret, Buffer.from(salt, 'base64url'), 32);
  const actual = Buffer.from(value, 'base64url');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
