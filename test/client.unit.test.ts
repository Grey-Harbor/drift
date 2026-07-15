import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftClient } from '../src/client.js';

test('client sends bearer authentication and parses successful mock target responses', async () => {
  let request: Request | undefined;
  const target: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ items: [] });
  };
  const client = new DriftClient('https://drift.test', 'drift_test.secret', target);
  assert.deepEqual(await client.listVertices('?type=device'), { items: [] });
  assert.equal(request!.url, 'https://drift.test/v1/vertices?type=device');
  assert.equal(request!.headers.get('authorization'), 'Bearer drift_test.secret');
});

test('client turns mock target error envelopes into useful errors', async () => {
  const target: typeof fetch = async () =>
    Response.json({ error: { code: 'conflict', message: 'Stale version' } }, { status: 409 });
  const client = new DriftClient('https://drift.test', 'key', target);
  await assert.rejects(
    () => client.patchVertex('vertex-1', { version: 1 }),
    (error: any) => error.code === 'conflict' && error.message === 'Stale version',
  );
});
