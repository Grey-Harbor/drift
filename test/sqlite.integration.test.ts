import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { DriftService } from '../src/core/service.js';

const setup = () => {
  const service = new DriftService(new SqliteDriftRepository(':memory:'));
  const boot = service.bootstrap('acme', 'Acme');
  return { service, admin: service.authenticate(boot.key.secret) };
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

test('SQLite applies cursor pagination, filters, and JSON round trips', () => {
  const { service, admin } = setup();
  const a = service.createVertex(admin, input('A', 'device'));
  service.createVertex(admin, input('B', 'service'));
  service.createVertex(admin, input('C', 'device'));
  const first = service.listVertices(admin, { type: 'device', limit: 1, includeDeleted: false });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]!.data && (first.items[0]!.data as any).nested.cost, 2);
  assert.notEqual(first.nextCursor, null);
  const second = service.listVertices(admin, {
    type: 'device',
    limit: 5,
    cursor: first.nextCursor!,
    includeDeleted: false,
  });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]!.id, a.id);
});

test('SQLite restores only explicit resources and keeps incident edges deleted', () => {
  const { service, admin } = setup();
  const a = service.createVertex(admin, input('A'));
  const b = service.createVertex(admin, input('B'));
  const edge = service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'contains',
    status: 'active',
    data: {},
    metadata: {},
  });
  const deleted = service.deleteVertex(admin, a.id, a.version);
  const deletedEdge = service.getEdge(admin, edge.id, true);
  const restored = service.restoreVertex(admin, a.id, deleted.version);
  assert.equal(restored.deletedAt, null);
  assert.notEqual(service.getEdge(admin, edge.id, true).deletedAt, null);
  assert.equal(deletedEdge.version + 0, service.getEdge(admin, edge.id, true).version);
  assert.throws(() => service.restoreEdge(admin, edge.id, edge.version), { code: 'conflict' });
});

test('SQLite traversal respects direction, type filters, and tenant boundaries', () => {
  const { service, admin } = setup();
  const a = service.createVertex(admin, input('A'));
  const b = service.createVertex(admin, input('B'));
  const c = service.createVertex(admin, input('C'));
  service.createEdge(admin, {
    fromVertexId: a.id,
    toVertexId: b.id,
    type: 'contains',
    status: 'active',
    data: {},
    metadata: {},
  });
  service.createEdge(admin, {
    fromVertexId: b.id,
    toVertexId: c.id,
    type: 'depends_on',
    status: 'active',
    data: {},
    metadata: {},
  });
  const result = service.traverse(admin, {
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
