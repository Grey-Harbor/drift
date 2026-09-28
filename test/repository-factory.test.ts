import assert from 'node:assert/strict';
import test from 'node:test';
import { openRepository } from '../src/adapters/repository-factory.js';

test('repository factory rejects unknown storage adapters', async () => {
  await assert.rejects(() => openRepository({ DRIFT_STORAGE: 'unknown' }), /Unsupported/);
});

test('repository factory requires a Postgres connection URL', async () => {
  await assert.rejects(() => openRepository({ DRIFT_STORAGE: 'postgres' }), /DRIFT_POSTGRES_URL/);
});
