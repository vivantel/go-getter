import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { COMMANDS } from '../src/command-table.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findRuntimeDependencies } from '../src/checks/deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

test('CLI prints usage', () => {
  const out = execFileSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  assert.match(out, /usage: go-getter/);
});

test('an unknown command exits 2 and prints the usage line', () => {
  const r = spawnSync(process.execPath, [cli, 'no-such-command'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command "no-such-command"/);
  assert.match(r.stderr, /usage: go-getter </);
});

test('an unknown check name exits 2 and lists the checks', () => {
  const r = spawnSync(process.execPath, [cli, 'check', 'guardrail'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown check "guardrail"/);
  assert.match(r.stderr, /checks: .*guardrails/);
});

test('the command table lists every module under commands/ and every row has its module', () => {
  const files = readdirSync(path.join(root, 'compiler/src/commands')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(COMMANDS.map((c) => c.name).sort(), files);
});

test('the usage line names every public command', () => {
  const out = execFileSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  for (const c of COMMANDS.filter((c) => !c.internal)) assert.ok(out.includes(c.name), c.name);
  assert.doesNotMatch(out, /hook/);
});

test('check deps passes on this repo', () => {
  const out = execFileSync(process.execPath, [cli, 'check', 'deps'], { encoding: 'utf8' });
  assert.match(out, /ok/);
});

test('findRuntimeDependencies flags declared dependencies', () => {
  assert.deepEqual(findRuntimeDependencies({ dependencies: { yaml: '^2' } }), ['yaml']);
  assert.deepEqual(findRuntimeDependencies({ devDependencies: { promptfoo: '1' } }), []);
});
