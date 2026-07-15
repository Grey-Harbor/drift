import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftService } from '../src/core/service.js';
import { MockRepository } from './support/mock-repository.js';

const setup = () => {
  const repo = new MockRepository();
  const service = new DriftService(repo, {
    traverseDepth: 2,
    traverseResults: 3,
    retrieveScan: 10,
  });
  const boot = service.bootstrap('acme', 'Acme');
  return { repo, service, admin: service.authenticate(boot.key.secret) };
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

test('core bootstraps hashed keys and rejects duplicate tenants', () => {
  const { repo, service, admin } = setup();
  const stored = [...repo.keys.values()].find((key) => key.id === admin.keyId)!;
  assert.notEqual(stored.secretHash, stored.prefix);
  assert.equal(stored.secretHash.includes('.'), true);
  assert.throws(() => service.bootstrap('acme', 'Again'), { code: 'conflict' });
});

test('core denies scopes before storage is mutated', () => {
  const { repo, service, admin } = setup();
  const read = service.createKey(admin, 'reader', ['read']);
  const reader = service.authenticate(read.secret);
  assert.throws(() => service.createVertex(reader, vertexInput), { code: 'forbidden' });
  assert.equal(repo.calls.createVertex, 0);
  assert.throws(() => service.listKeys(reader), { code: 'forbidden' });
});

test('core requires active endpoints and applies traversal limits before delegating', () => {
  const { repo, service, admin } = setup();
  assert.throws(
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
  const vertex = service.createVertex(admin, vertexInput);
  assert.throws(
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

test('core requires admin access to deleted data and retrieval limits', () => {
  const { service, admin } = setup();
  const read = service.authenticate(service.createKey(admin, 'reader', ['read']).secret);
  assert.throws(() => service.listVertices(read, { limit: 10, includeDeleted: true }), {
    code: 'forbidden',
  });
  assert.throws(
    () => service.retrieve(admin, { source: 'vertices', includeDeleted: false, limit: 1001 }),
    { code: 'limit_exceeded' },
  );
});

test('core performs traversal through repository edge lookups', () => {
  const { repo, service, admin } = setup();
  const source = service.createVertex(admin, { ...vertexInput, title: 'Source' });
  const target = service.createVertex(admin, { ...vertexInput, title: 'Target' });
  service.createEdge(admin, {
    fromVertexId: source.id,
    toVertexId: target.id,
    type: 'connects_to',
    status: 'active',
    data: {},
    metadata: {},
  });

  const result = service.traverse(admin, {
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

test('core applies declarative retrieval to repository records', () => {
  const { service, admin } = setup();
  service.createVertex(admin, { ...vertexInput, type: 'device', data: { cost: 2 } });
  service.createVertex(admin, { ...vertexInput, type: 'device', data: { cost: 4 } });

  const result = service.retrieve(admin, {
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
