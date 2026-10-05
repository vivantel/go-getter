import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findRuntimeDependencies } from '../src/checks/deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

test('CLI prints usage', () => {
  const out = execFileSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  assert.match(out, /usage: go-getter/);
});

test('unimplemented commands report and exit 0', () => {
  const out = execFileSync(process.execPath, [cli, 'detect'], { encoding: 'utf8' });
  assert.match(out, /not yet implemented/);
});

test('check deps passes on this repo', () => {
  const out = execFileSync(process.execPath, [cli, 'check', 'deps'], { encoding: 'utf8' });
  assert.match(out, /ok/);
});

test('findRuntimeDependencies flags declared dependencies', () => {
  assert.deepEqual(findRuntimeDependencies({ dependencies: { yaml: '^2' } }), ['yaml']);
  assert.deepEqual(findRuntimeDependencies({ devDependencies: { promptfoo: '1' } }), []);
});
