// Guardrail owned-files-never-clobbered: apply works from the diff between the manifest and the target outputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planApply, applyPlan, diffApply } from '../../src/apply.mjs';
import { readManifest, MANIFEST } from '../../src/manifest.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/go-getter.mjs');

function guardrail(id, tier, run) {
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: ${tier}\n      check: "c"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo it.\n`;
}
const CAP = 'builtin:file-max-lines path=AGENTS.md max=60';
const DENY = 'builtin:deny-path paths=secrets/**';

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-update-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nHand-written intro.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 3, CAP));
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets.md'), guardrail('no-secrets', 2, DENY));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ model: 'x' }));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'core.hooksPath', '.old-hooks'], { cwd: dir });
  return dir;
}

const run = (dir, opts = {}) => applyPlan(dir, planApply(dir, { hosts: ['claude-code'], ...opts }));
const file = (dir, rel) => path.join(dir, rel);
const read = (dir, rel) => readFileSync(file(dir, rel), 'utf8');
const hooksPath = (dir) => execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
const ownKey = (dir) => {
  const m = readManifest(dir);
  m.shared['.claude/settings.json'].push({ kind: 'key', path: ['model'], value: 'x', replaced: 'old' });
  writeFileSync(file(dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`);
};

test('a file that stops being produced is deleted and core.hooksPath restored', () => {
  const dir = project();
  run(dir);
  assert.ok(existsSync(file(dir, '.githooks/pre-push')));
  assert.equal(hooksPath(dir), '.githooks');
  writeFileSync(file(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 1, 'advisory'));
  assert.ok(diffApply(dir, planApply(dir, { hosts: ['claude-code'] })).includes('stale: .githooks/pre-push'));
  assert.deepEqual(run(dir).modified, []);
  assert.ok(!existsSync(file(dir, '.githooks/pre-push')));
  assert.ok(!('.githooks/pre-push' in readManifest(dir).files));
  assert.equal(hooksPath(dir), '.old-hooks');
});

test('a key that stops being written is restored to its old value', () => {
  const dir = project();
  run(dir);
  ownKey(dir);
  assert.ok(diffApply(dir, planApply(dir, { hosts: ['claude-code'] })).includes('differs: .claude/settings.json'));
  assert.deepEqual(run(dir).modified, []);
  assert.equal(JSON.parse(read(dir, '.claude/settings.json')).model, 'old');
  assert.ok(!readManifest(dir).shared['.claude/settings.json'].some((i) => i.path[0] === 'model'));
});

test('a hand-edited file, key and block are skipped and reported, and --force overwrites or removes them', () => {
  const dir = project();
  run(dir);
  // file: edited and still produced
  writeFileSync(file(dir, '.githooks/pre-push'), '#!/bin/sh\necho mine\n');
  // block: edited inside the go-getter markers
  writeFileSync(file(dir, 'AGENTS.md'), read(dir, 'AGENTS.md').replace('## Guardrails', '## My guardrails'));
  // key: an owned key that is no longer produced, edited since
  ownKey(dir);
  writeFileSync(file(dir, '.claude/settings.json'), JSON.stringify({ ...JSON.parse(read(dir, '.claude/settings.json')), model: 'edited' }));

  const first = run(dir);
  assert.deepEqual(first.modified.map((x) => x.what).sort(), ['block', 'file', 'key']);
  assert.equal(read(dir, '.githooks/pre-push'), '#!/bin/sh\necho mine\n');
  assert.match(read(dir, 'AGENTS.md'), /## My guardrails/);
  assert.equal(JSON.parse(read(dir, '.claude/settings.json')).model, 'edited');
  // skipped items stay owned, so the next run reports them again
  assert.equal(run(dir).modified.length, 3);
  assert.ok(diffApply(dir, planApply(dir, { hosts: ['claude-code'] })).some((p) => p.startsWith('modified: AGENTS.md')));

  assert.deepEqual(run(dir, { force: true }).modified, []);
  assert.match(read(dir, '.githooks/pre-push'), /go-getter/);
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /My guardrails/);
  assert.equal(JSON.parse(read(dir, '.claude/settings.json')).model, 'old');
  assert.deepEqual(run(dir).modified, []);
});

test('an edited file that is no longer produced is kept and reported; --force removes it', () => {
  const dir = project();
  run(dir);
  writeFileSync(file(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 1, 'advisory'));
  writeFileSync(file(dir, '.githooks/pre-push'), 'mine\n');
  assert.deepEqual(run(dir).modified.map((x) => x.path), ['.githooks/pre-push']);
  assert.equal(read(dir, '.githooks/pre-push'), 'mine\n');
  run(dir, { force: true });
  assert.ok(!existsSync(file(dir, '.githooks/pre-push')));
});

test('go-getter apply exits non-zero when it skips a modified item and zero with --force', () => {
  const dir = project();
  run(dir);
  writeFileSync(file(dir, '.githooks/pre-push'), 'mine\n');
  const skip = spawnSync('node', [cli, 'apply', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8' });
  assert.equal(skip.status, 1);
  assert.match(skip.stderr, /modified: \.githooks\/pre-push/);
  const force = spawnSync('node', [cli, 'apply', '--project', dir, '--hosts', 'claude-code', '--force'], { encoding: 'utf8' });
  assert.equal(force.status, 0);
});
