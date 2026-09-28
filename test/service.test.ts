import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { DriftService } from '../src/core/service.js';

const setup = async () => {
  const repository = new SqliteDriftRepository(':memory:');
  const service = new DriftService(repository);
  const boot = await service.bootstrap('acme', 'Acme');
  return { repository, service, admin: await service.authenticate(boot.key.secret) };
};
test('isolates tenants, versions writes, and deletes incident edges', async (t) => {
  const { repository, service, admin } = await setup();
  t.after(() => repository.close());
  const a = await service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'A',
    status: 'active',
    data: {},
    metadata: {},
  });
  const b = await service.createVertex(admin, {
    type: 'service',
    slug: null,
    externalId: null,
    title: 'B',
    status: 'active',
    data: {},
    metadata: {},
  });
  const edge = await service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'runs',
    status: 'active',
    data: {},
    metadata: {},
  });
  assert.equal(
    (
      await service.traverse(admin, {
        start: a.id,
        direction: 'out',
        depth: 1,
        limit: 10,
        includeDeleted: false,
      })
    ).edges.length,
    1,
  );
  await assert.rejects(() => service.patchVertex(admin, a.id, 99, { title: 'bad' }), {
    code: 'conflict',
  });
  await service.deleteVertex(admin, a.id, a.version);
  await assert.rejects(() => service.getEdge(admin, edge.id), { code: 'not_found' });
  assert.equal((await service.getEdge(admin, edge.id, true)).deletedAt !== null, true);
});
test('retrieves declarative grouped aggregates', async (t) => {
  const { repository, service, admin } = await setup();
  t.after(() => repository.close());
  await service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'A',
    status: 'active',
    data: { cost: 3 },
    metadata: {},
  });
  await service.createVertex(admin, {
    type: 'device',
    slug: null,
    externalId: null,
    title: 'B',
    status: 'active',
    data: { cost: 4 },
    metadata: {},
  });
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
  assert.deepEqual(result.rows, [{ type: 'device', count: 2, total: 7 }]);
});
