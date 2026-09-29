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
const input = (title: string, type = 'asset') => ({
  type,
  slug: null,
  externalId: null,
  title,
  status: 'active',
  data: { nested: { cost: title === 'A' ? 2 : 4 } },
  metadata: { source: 'test' },
});

test('SQLite applies cursor pagination, filters, and JSON round trips', async (t) => {
  const { repository, service, admin } = await setup();
  t.after(() => repository.close());
  const a = await service.createVertex(admin, input('A', 'device'));
  await service.createVertex(admin, input('B', 'service'));
  await service.createVertex(admin, input('C', 'device'));
  const first = await service.listVertices(admin, {
    type: 'device',
    limit: 1,
    includeDeleted: false,
  });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]!.data && (first.items[0]!.data as any).nested.cost, 2);
  assert.notEqual(first.nextCursor, null);
  const second = await service.listVertices(admin, {
    type: 'device',
    limit: 5,
    cursor: first.nextCursor!,
    includeDeleted: false,
  });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]!.id, a.id);
});

test('SQLite retrieval rejects incomplete scans instead of returning partial aggregates', async (t) => {
  const repository = new SqliteDriftRepository(':memory:');
  const service = new DriftService(repository, { retrieveScan: 1 });
  t.after(() => repository.close());
  const boot = await service.bootstrap('scan', 'Scan');
  const admin = await service.authenticate(boot.key.secret);
  const request = {
    source: 'vertices' as const,
    aggregates: [{ op: 'count' as const, as: 'count' }],
    includeDeleted: false,
  };
  await service.createVertex(admin, input('A'));
  assert.deepEqual((await service.retrieve(admin, request)).rows, [{ count: 1 }]);
  await service.createVertex(admin, input('B'));
  await assert.rejects(() => service.retrieve(admin, request), {
    code: 'limit_exceeded',
    statusCode: 422,
  });
});

test('SQLite restores only explicit resources and keeps incident edges deleted', async (t) => {
  const { repository, service, admin } = await setup();
  t.after(() => repository.close());
  const a = await service.createVertex(admin, input('A'));
  const b = await service.createVertex(admin, input('B'));
  const edge = await service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'contains',
    status: 'active',
    data: {},
    metadata: {},
  });
  const deleted = await service.deleteVertex(admin, a.id, a.version);
  const deletedEdge = await service.getEdge(admin, edge.id, true);
  const restored = await service.restoreVertex(admin, a.id, deleted.version);
  assert.equal(restored.deletedAt, null);
  assert.notEqual((await service.getEdge(admin, edge.id, true)).deletedAt, null);
  assert.equal(deletedEdge.version + 0, (await service.getEdge(admin, edge.id, true)).version);
  await assert.rejects(() => service.restoreEdge(admin, edge.id, edge.version), {
    code: 'conflict',
  });
});

test('SQLite traversal respects direction, type filters, and tenant boundaries', async (t) => {
  const { repository, service, admin } = await setup();
  t.after(() => repository.close());
  const a = await service.createVertex(admin, input('A'));
  const b = await service.createVertex(admin, input('B'));
  const c = await service.createVertex(admin, input('C'));
  await service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'contains',
    status: 'active',
    data: {},
    metadata: {},
  });
  await service.createEdge(admin, {
    fromVertexId: b.id,
    toVertexId: c.id,
    type: 'depends_on',
    status: 'active',
    data: {},
    metadata: {},
  });
  const result = await service.traverse(admin, {
    start: a.id,
    direction: 'out',
    edgeTypes: ['contains'],
    depth: 2,
    limit: 10,
    includeDeleted: false,
  });
  assert.equal(result.edges.length, 1);
  assert.deepEqual(result.vertices.map((v) => v.id).sort(), [a.id, b.id].sort());
});
