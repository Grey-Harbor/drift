import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { DriftService } from '../src/core/service.js';

const setup = () => {
  const service = new DriftService(new SqliteDriftRepository(':memory:'));
  const boot = service.bootstrap('acme', 'Acme');
  return { service, admin: service.authenticate(boot.key.secret) };
};
test('isolates tenants, versions writes, and deletes incident edges', () => {
  const { service, admin } = setup();
  const a = service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'A',
    status: 'active',
    data: {},
    metadata: {},
  });
  const b = service.createVertex(admin, {
    type: 'service',
    slug: null,
    externalId: null,
    title: 'B',
    status: 'active',
    data: {},
    metadata: {},
  });
  const edge = service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'runs',
    status: 'active',
    data: {},
    metadata: {},
  });
  assert.equal(
    service.traverse(admin, {
      start: a.id,
      direction: 'out',
      depth: 1,
      limit: 10,
      includeDeleted: false,
    }).edges.length,
    1,
  );
  assert.throws(() => service.patchVertex(admin, a.id, 99, { title: 'bad' }), { code: 'conflict' });
  service.deleteVertex(admin, a.id, a.version);
  assert.throws(() => service.getEdge(admin, edge.id), { code: 'not_found' });
  assert.equal(service.getEdge(admin, edge.id, true).deletedAt !== null, true);
});
test('retrieves declarative grouped aggregates', () => {
  const { service, admin } = setup();
  service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'A',
    status: 'active',
    data: { cost: 3 },
    metadata: {},
  });
  service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'B',
    status: 'active',
    data: { cost: 4 },
    metadata: {},
  });
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
  assert.deepEqual(result.rows, [{ type: 'device', count: 2, total: 7 }]);
});
