import assert from 'node:assert/strict';
import test from 'node:test';
import type { Json } from '../../src/contracts/types.js';
import type { DriftRepository } from '../../src/interfaces/repository.js';
import { DriftService } from '../../src/core/service.js';

type RepositoryFactory = () => Promise<DriftRepository>;

const input = (title: string, type = 'asset', data: Json = {}) => ({
  type,
  slug: null,
  externalId: null,
  title,
  status: 'active',
  data,
  metadata: { source: 'conformance' },
});

export function runRepositoryConformance(name: string, createRepository: RepositoryFactory) {
  const setup = async (t: test.TestContext) => {
    const repository = await createRepository();
    t.after(() => repository.close());
    const service = new DriftService(repository);
    const boot = await service.bootstrap(`${name.toLowerCase()}-${crypto.randomUUID()}`, name);
    return { repository, service, admin: await service.authenticate(boot.key.secret) };
  };

  test(`${name} isolates tenants and never lists API-key hashes`, async (t) => {
    const { service, admin } = await setup(t);
    const other = await service.bootstrap(`other-${crypto.randomUUID()}`, 'Other');
    const otherAdmin = await service.authenticate(other.key.secret);
    await service.createVertex(admin, input('Private'));
    assert.equal(
      (await service.listVertices(otherAdmin, { limit: 10, includeDeleted: false })).items.length,
      0,
    );
    const keys = await service.listKeys(admin);
    assert.equal('secretHash' in keys[0]!, false);
  });

  test(`${name} keeps bootstrap and key rotation atomic`, async (t) => {
    const { repository, service, admin } = await setup(t);
    const old = await service.createKey(admin, 'old', ['read']);
    const existing = await service.createKey(admin, 'existing', ['read']);
    const stored = await repository.findApiKeyByPrefix(existing.apiKey.prefix);
    assert.ok(stored);
    const at = new Date().toISOString();

    await assert.rejects(() =>
      repository.rotateApiKey(
        admin.tenantId,
        old.apiKey.id,
        { ...stored, id: crypto.randomUUID() },
        at,
      ),
    );
    assert.equal((await service.authenticate(old.secret)).keyId, old.apiKey.id);

    const orphanSlug = `rollback-${crypto.randomUUID()}`;
    const orphanId = crypto.randomUUID();
    await assert.rejects(() =>
      repository.bootstrapTenant(
        {
          id: orphanId,
          slug: orphanSlug,
          name: 'Rollback',
          status: 'active',
          createdAt: at,
          updatedAt: at,
        },
        { ...stored, id: crypto.randomUUID(), tenantId: orphanId },
      ),
    );
    assert.equal(await repository.findTenantBySlug(orphanSlug), null);

    const rotated = await service.rotateKey(admin, old.apiKey.id, 'replacement', ['read']);
    await assert.rejects(() => service.authenticate(old.secret), { code: 'unauthorized' });
    assert.equal((await service.authenticate(rotated.secret)).keyId, rotated.apiKey.id);
  });

  test(`${name} preserves JSON values, filters, and cursors`, async (t) => {
    const { service, admin } = await setup(t);
    await service.createVertex(admin, input('Null', 'device', null));
    await service.createVertex(admin, input('Nested', 'device', { nested: { value: true } }));
    await service.createVertex(admin, input('Scalar', 'service', 'value'));
    const first = await service.listVertices(admin, {
      type: 'device',
      limit: 1,
      includeDeleted: false,
    });
    const second = await service.listVertices(admin, {
      type: 'device',
      limit: 10,
      cursor: first.nextCursor!,
      includeDeleted: false,
    });
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0]!.id, second.items[0]!.id);
    const values = [...first.items, ...second.items].map((vertex) => vertex.data);
    assert.ok(values.some((value) => value === null));
    assert.ok(values.some((value) => (value as any)?.nested?.value === true));
  });

  test(`${name} implements vertex CRUD, filters, and optimistic concurrency`, async (t) => {
    const { service, admin } = await setup(t);
    const first = await service.createVertex(admin, input('First', 'device'));
    const second = await service.createVertex(admin, {
      ...input('Second', 'service'),
      status: 'paused',
    });
    const patched = await service.patchVertex(admin, first.id, first.version, {
      title: 'Updated',
      data: { nested: ['value'] },
    });
    assert.equal(patched.version, first.version + 1);
    assert.equal((await service.getVertex(admin, first.id)).title, 'Updated');
    assert.deepEqual((await service.getVertex(admin, first.id)).data, { nested: ['value'] });
    await assert.rejects(
      () => service.patchVertex(admin, first.id, first.version, { title: 'Old' }),
      {
        code: 'conflict',
      },
    );

    const byStatus = await service.listVertices(admin, {
      status: 'paused',
      limit: 10,
      includeDeleted: false,
    });
    assert.deepEqual(
      byStatus.items.map((vertex) => vertex.id),
      [second.id],
    );
    const byIds = await service.listVertices(admin, {
      ids: [first.id],
      limit: 10,
      includeDeleted: false,
    });
    assert.deepEqual(
      byIds.items.map((vertex) => vertex.id),
      [first.id],
    );

    const deleted = await service.deleteVertex(admin, second.id, second.version);
    await assert.rejects(() => service.getVertex(admin, second.id), { code: 'not_found' });
    assert.equal((await service.getVertex(admin, second.id, true)).id, second.id);
    const restored = await service.restoreVertex(admin, second.id, deleted.version);
    assert.equal(restored.deletedAt, null);
  });

  test(`${name} implements edge CRUD, endpoint filters, and restoration`, async (t) => {
    const { service, admin } = await setup(t);
    const first = await service.createVertex(admin, input('First'));
    const second = await service.createVertex(admin, input('Second'));
    const third = await service.createVertex(admin, input('Third'));
    const edge = await service.createEdge(admin, {
      fromVertexId: first.id,
      toVertexId: second.id,
      type: 'contains',
      status: 'active',
      data: null,
      metadata: { source: 'edge' },
    });
    const patched = await service.patchEdge(admin, edge.id, edge.version, {
      toVertexId: third.id,
      status: 'paused',
      data: ['updated'],
    });
    assert.equal(patched.version, edge.version + 1);
    assert.equal(patched.toVertexId, third.id);
    assert.deepEqual(patched.data, ['updated']);
    await assert.rejects(() => service.patchEdge(admin, edge.id, edge.version, { status: 'old' }), {
      code: 'conflict',
    });

    const outgoing = await service.listEdges(admin, {
      fromVertexId: first.id,
      toVertexId: third.id,
      status: 'paused',
      limit: 10,
      includeDeleted: false,
    });
    assert.deepEqual(
      outgoing.items.map((value) => value.id),
      [edge.id],
    );
    const deleted = await service.deleteEdge(admin, edge.id, patched.version);
    await assert.rejects(() => service.getEdge(admin, edge.id), { code: 'not_found' });
    const restored = await service.restoreEdge(admin, edge.id, deleted.version);
    assert.equal(restored.deletedAt, null);
  });

  test(`${name} implements API-key creation, use, listing, and revocation`, async (t) => {
    const { service, admin } = await setup(t);
    const issued = await service.createKey(admin, 'reader', ['read']);
    const reader = await service.authenticate(issued.secret);
    assert.equal(reader.tenantId, admin.tenantId);
    assert.deepEqual(reader.scopes, ['read']);
    const listed = await service.listKeys(admin);
    assert.ok(listed.some((key) => key.id === issued.apiKey.id && key.lastUsedAt !== null));
    assert.equal(
      listed.some((key) => 'secretHash' in key),
      false,
    );
    await service.revokeKey(admin, issued.apiKey.id);
    await assert.rejects(() => service.authenticate(issued.secret), { code: 'unauthorized' });
  });

  test(`${name} enforces versions and atomically deletes incident edges`, async (t) => {
    const { service, admin } = await setup(t);
    const source = await service.createVertex(admin, input('Source'));
    const target = await service.createVertex(admin, input('Target'));
    const edge = await service.createEdge(admin, {
      fromVertexId: source.id,
      toVertexId: target.id,
      type: 'contains',
      status: 'active',
      data: {},
      metadata: {},
    });
    await assert.rejects(() => service.deleteVertex(admin, source.id, 999), {
      code: 'conflict',
    });
    assert.equal((await service.getEdge(admin, edge.id)).deletedAt, null);
    const deleted = await service.deleteVertex(admin, source.id, source.version);
    const deletedEdge = await service.getEdge(admin, edge.id, true);
    assert.ok(deleted.deletedAt);
    assert.ok(deletedEdge.deletedAt);
    const restored = await service.restoreVertex(admin, source.id, deleted.version);
    assert.equal(restored.deletedAt, null);
    assert.ok((await service.getEdge(admin, edge.id, true)).deletedAt);
  });

  test(`${name} preserves traversal direction and type filtering`, async (t) => {
    const { service, admin } = await setup(t);
    const first = await service.createVertex(admin, input('First'));
    const second = await service.createVertex(admin, input('Second'));
    const third = await service.createVertex(admin, input('Third'));
    await service.createEdge(admin, {
      fromVertexId: first.id,
      toVertexId: second.id,
      type: 'contains',
      status: 'active',
      data: {},
      metadata: {},
    });
    await service.createEdge(admin, {
      fromVertexId: second.id,
      toVertexId: third.id,
      type: 'depends_on',
      status: 'active',
      data: {},
      metadata: {},
    });
    const result = await service.traverse(admin, {
      start: first.id,
      direction: 'out',
      edgeTypes: ['contains'],
      depth: 2,
      limit: 10,
      includeDeleted: false,
    });
    assert.equal(result.edges.length, 1);
    assert.deepEqual(
      result.vertices.map((vertex) => vertex.id).sort(),
      [first.id, second.id].sort(),
    );
  });

  test(`${name} treats opaque cursors and non-UUID IDs consistently`, async (t) => {
    const { service, admin } = await setup(t);
    const vertex = await service.createVertex(admin, input('Versioned'));
    await assert.rejects(() => service.getVertex(admin, 'not-a-uuid'), { code: 'not_found' });
    await assert.rejects(() => service.patchVertex(admin, vertex.id, 999, {}), {
      code: 'conflict',
    });
    const cursor = Buffer.from('not-a-uuid').toString('base64url');
    const page = await service.listVertices(admin, {
      cursor,
      limit: 10,
      includeDeleted: false,
    });
    assert.ok(Array.isArray(page.items));
  });
}
