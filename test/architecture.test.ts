import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const protectedDirectories = ['src/core', 'src/api', 'src/contracts'];

test('core, API, and contracts do not depend on PostgreSQL implementation details', async () => {
  for (const directory of protectedDirectories) {
    for (const file of await typeScriptFiles(directory)) {
      const source = await readFile(file, 'utf8');
      assert.doesNotMatch(source, /(?:from|import\s*\()[^\n]*\bpg\b/);
      assert.doesNotMatch(source, /adapters\/postgres/);
    }
  }
});

async function typeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await typeScriptFiles(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}
