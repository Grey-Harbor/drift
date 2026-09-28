import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftService } from '../src/core/service.js';
import { MockRepository } from './support/mock-repository.js';

const setup = async () => {
  const repo = new MockRepository();
  const service = new DriftService(repo, {
    traverseDepth: 2,
    traverseResults: 3,
    retrieveScan: 10,
  });
  const boot = await service.bootstrap('acme', 'Acme');
  return { repo, service, admin: await service.authenticate(boot.key.secret) };
};
const vertexInput = {
  type: 'asset',
  slug: null,
  externalId: null,
  title: null,
  status: 'active',
  data: {},
  metadata: {},
};

test('core bootstraps hashed keys and rejects duplicate tenants', async () => {
  const { repo, service, admin } = await setup();
  const stored = [...repo.keys.values()].find((key) => key.id === admin.keyId)!;
  assert.notEqual(stored.secretHash, stored.prefix);
  assert.equal(stored.secretHash.includes('.'), true);
  await assert.rejects(() => service.bootstrap('acme', 'Again'), { code: 'conflict' });
});

test('core denies scopes before storage is mutated', async () => {
  const { repo, service, admin } = await setup();
  const read = await service.createKey(admin, 'reader', ['read']);
  const reader = await service.authenticate(read.secret);
  await assert.rejects(() => service.createVertex(reader, vertexInput), { code: 'forbidden' });
  assert.equal(repo.calls.createVertex, 0);
  await assert.rejects(() => service.listKeys(reader), { code: 'forbidden' });
});

test('core requires active endpoints and applies traversal limits before delegating', async () => {
  const { repo, service, admin } = await setup();
  await assert.rejects(
    () =>
      service.createEdge(admin, {
        fromVertexId: 'missing',
        toVertexId: 'also-missing',
        type: 'links',
        status: 'active',
        data: {},
        metadata: {},
      }),
    { code: 'not_found' },
  );
  assert.equal(repo.calls.createEdge, 0);
  const vertex = await service.createVertex(admin, vertexInput);
  await assert.rejects(
    () =>
      service.traverse(admin, {
        start: vertex.id,
        direction: 'out',
        depth: 3,
        limit: 1,
        includeDeleted: false,
      }),
    { code: 'limit_exceeded' },
  );
  assert.equal(repo.calls.edgeLookup, 0);
});

test('core requires admin access to deleted data and retrieval limits', async () => {
  const { service, admin } = await setup();
  const issued = await service.createKey(admin, 'reader', ['read']);
  const read = await service.authenticate(issued.secret);
  await assert.rejects(() => service.listVertices(read, { limit: 10, includeDeleted: true }), {
    code: 'forbidden',
  });
  await assert.rejects(
    () => service.retrieve(admin, { source: 'vertices', includeDeleted: false, limit: 1001 }),
    { code: 'limit_exceeded' },
  );
});

test('core performs traversal through repository edge lookups', async () => {
  const { repo, service, admin } = await setup();
  const source = await service.createVertex(admin, { ...vertexInput, title: 'Source' });
  const target = await service.createVertex(admin, { ...vertexInput, title: 'Target' });
  await service.createEdge(admin, {
    fromVertexId: source.id,
    toVertexId: target.id,
    type: 'connects_to',
    status: 'active',
    data: {},
    metadata: {},
  });

  const result = await service.traverse(admin, {
    start: source.id,
    direction: 'out',
    depth: 1,
    limit: 3,
    includeDeleted: false,
  });

  assert.equal(repo.calls.edgeLookup, 1);
  assert.deepEqual(
    result.vertices.map((vertex) => vertex.id).sort(),
    [source.id, target.id].sort(),
  );
  assert.equal(result.edges[0]?.type, 'connects_to');
});

test('core applies declarative retrieval to repository records', async () => {
  const { service, admin } = await setup();
  await service.createVertex(admin, { ...vertexInput, type: 'device', data: { cost: 2 } });
  await service.createVertex(admin, { ...vertexInput, type: 'device', data: { cost: 4 } });

  const result = await service.retrieve(admin, {
    source: 'vertices',
    projection: [{ field: 'type' }, { field: 'data.cost', as: 'cost' }],
    groupBy: ['type'],
    aggregates: [
      { op: 'count', as: 'count' },
      { op: 'sum', field: 'cost', as: 'total' },
    ],
    includeDeleted: false,
  });

  assert.deepEqual(result.rows, [{ type: 'device', count: 2, total: 6 }]);
});

test('core applies retrieval ID and group limits before returning results', async () => {
  const { service, admin } = await setup();
  const first = await service.createVertex(admin, { ...vertexInput, type: 'device' });
  await service.createVertex(admin, { ...vertexInput, type: 'service' });

  const filtered = await service.retrieve(admin, {
    source: 'vertices',
    filters: { ids: [first.id] },
    projection: [{ field: 'id' }],
    includeDeleted: false,
  });
  assert.deepEqual(filtered.rows, [{ id: first.id }]);

  const limited = new DriftService(new MockRepository(), {
    retrieveGroups: 1,
  });
  const boot = await limited.bootstrap('limited', 'Limited');
  const principal = await limited.authenticate(boot.key.secret);
  await limited.createVertex(principal, { ...vertexInput, type: 'device' });
  await limited.createVertex(principal, { ...vertexInput, type: 'service' });
  await assert.rejects(
    () =>
      limited.retrieve(principal, {
        source: 'vertices',
        projection: [{ field: 'type' }],
        groupBy: ['type'],
        includeDeleted: false,
      }),
    { code: 'limit_exceeded' },
  );
});

test('core rejects retrieval after its execution budget is exhausted', async () => {
  const clockValues = [0, 251];
  const service = new DriftService(
    new MockRepository(),
    { retrieveExecutionMs: 250 },
    () => clockValues.shift() ?? 251,
  );
  const boot = await service.bootstrap('timed', 'Timed');
  const admin = await service.authenticate(boot.key.secret);
  await assert.rejects(
    () => service.retrieve(admin, { source: 'vertices', includeDeleted: false }),
    {
      code: 'limit_exceeded',
    },
  );
});
