import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { buildApp } from '../src/api/app.js';
import { DriftService } from '../src/core/service.js';

test('HTTP API authenticates and exposes vertex CRUD', async () => {
  const service = new DriftService(new SqliteDriftRepository(':memory:'));
  const boot = service.bootstrap('acme', 'Acme');
  const app = buildApp(service);
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal((await app.inject('/v1/vertices')).statusCode, 401);
  const response = await app.inject({
    method: 'POST',
    url: '/v1/vertices',
    headers: { authorization: `Bearer ${boot.key.secret}` },
    payload: { type: 'asset', title: 'Router' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().version, 1);
  await app.close();
});

test('HTTP API enforces scopes, versions, and key management contracts', async () => {
  const service = new DriftService(new SqliteDriftRepository(':memory:'));
  const boot = service.bootstrap('acme', 'Acme');
  const app = buildApp(service);
  const auth = { authorization: `Bearer ${boot.key.secret}` };
  const issued = await app.inject({
    method: 'POST',
    url: '/v1/admin/keys',
    headers: auth,
    payload: { label: 'reader', scopes: ['read'] },
  });
  assert.equal(issued.statusCode, 200);
  const reader = issued.json().secret as string;
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/vertices',
        headers: { authorization: `Bearer ${reader}` },
        payload: { type: 'asset' },
      })
    ).statusCode,
    403,
  );
  const created = await app.inject({
    method: 'POST',
    url: '/v1/vertices',
    headers: auth,
    payload: { type: 'asset' },
  });
  const vertex = created.json();
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: `/v1/vertices/${vertex.id}`,
        headers: auth,
        payload: { version: 999, title: 'late' },
      })
    ).statusCode,
    409,
  );
  assert.equal((await app.inject('/v1/openapi.json')).statusCode, 200);
  await app.close();
});

test('HTTP API rejects undeclared write fields and documents every public route', async () => {
  const service = new DriftService(new SqliteDriftRepository(':memory:'));
  const boot = service.bootstrap('contract', 'Contract');
  const app = buildApp(service);
  const auth = { authorization: `Bearer ${boot.key.secret}` };
  const invalid = await app.inject({
    method: 'POST',
    url: '/v1/vertices',
    headers: auth,
    payload: { type: 'asset', tenantId: 'attempted-override' },
  });
  assert.equal(invalid.statusCode, 400);

  const document = (await app.inject('/v1/openapi.json')).json();
  for (const path of [
    '/health',
    '/v1/vertices',
    '/v1/vertices/{id}',
    '/v1/edges',
    '/v1/edges/{id}',
    '/v1/traverse',
    '/v1/retrieve',
    '/v1/admin/keys',
    '/v1/admin/keys/{id}',
  ])
    assert.ok(document.paths[path]);
  await app.close();
});
