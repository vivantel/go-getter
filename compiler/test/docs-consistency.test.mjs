import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { factProblems, readmeProblems } from '../src/checks/docs-consistency.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

// M3: fact 0009 and the README say what the capability files and `go-getter coverage` say.
test('fact 0009 matches the capability files (M3)', () => {
  assert.deepEqual(factProblems(root), []);
});

test('the README coverage table is the coverage output, deferred and unconfirmed cells marked (M3, M4)', () => {
  assert.deepEqual(readmeProblems(root), []);
});

test('go-getter check docs-consistency passes on this repository', () => {
  const r = spawnSync(process.execPath, [cli, 'check', 'docs-consistency'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
