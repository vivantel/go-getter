import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planApply, writeApply } from '../src/apply.mjs';
import { readManifest, jsonOwnership, hashContent, MANIFEST } from '../src/manifest.mjs';

function guardrail(id, enforcement) {
  const lines = enforcement.map((e) => `    - tier: ${e.tier}\n      check: "${e.check}"\n      run: "${e.run}"`).join('\n');
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n${lines}\n---\n\n## Guardrail\n\nDo it.\n`;
}

function project({ hooksPath } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-manifest-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nHand-written intro.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', [{ tier: 3, check: 'cap', run: 'builtin:file-max-lines path=AGENTS.md max=60' }]));
  writeFileSync(path.join(dir, 'docs/guardrails/no-env.md'), guardrail('no-env', [{ tier: 2, check: 'env blocked', run: 'builtin:deny-path paths=.env,secrets/**' }]));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-hook.sh' }] }] } }));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (hooksPath) execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: dir });
  return dir;
}

const apply = (dir) => writeApply(dir, planApply(dir, { hosts: ['claude-code'] }));
const manifestFile = (dir) => path.join(dir, MANIFEST);

test('apply writes a manifest listing every output', () => {
  const dir = project();
  const plan = planApply(dir, { hosts: ['claude-code'] });
  writeApply(dir, plan);
  const m = readManifest(dir);
  assert.equal(m.schema, 1);
  const listed = [...Object.keys(m.files), ...Object.keys(m.shared).filter((k) => k !== 'git-config')].sort();
  assert.deepEqual(listed, Object.keys(plan.outputs).sort());
  const runner = readFileSync(path.join(dir, '.go-getter/bin/go-getter'), 'utf8');
  assert.equal(m.files['.go-getter/bin/go-getter'].hash, hashContent(runner));
  assert.equal(m.files['.go-getter/bin/go-getter'].mode, '755');
  assert.deepEqual(m.files['CLAUDE.md'], { symlink: 'AGENTS.md' });
  assert.ok(readFileSync(manifestFile(dir), 'utf8').endsWith('}\n'));
});

test('a second apply leaves the manifest byte-identical', () => {
  const dir = project({ hooksPath: '.old-hooks' });
  apply(dir);
  const first = readFileSync(manifestFile(dir), 'utf8');
  apply(dir);
  assert.equal(readFileSync(manifestFile(dir), 'utf8'), first);
});

test('replaced values are recorded for settings keys and core.hooksPath', () => {
  const dir = project({ hooksPath: '.old-hooks' });
  apply(dir);
  const m = readManifest(dir);
  assert.deepEqual(m.shared['git-config'], [{ kind: 'git-config', setting: 'core.hooksPath', value: '.githooks', replaced: '.old-hooks' }]);
  const items = m.shared['.claude/settings.json'];
  const pre = items.find((i) => i.path.join('.') === 'hooks.PreToolUse');
  assert.equal(pre.kind, 'items');
  assert.equal(pre.items.length, 1);
  assert.ok(!items.some((i) => i.path[0] === 'model'));
  assert.deepEqual(m.shared['AGENTS.md'].map((b) => [b.kind, b.appended]), [['block', true]]);
});

test('jsonOwnership records the value a key replaced and ignores unchanged ones', () => {
  const owned = jsonOwnership({ a: 1, b: { c: 'old', d: true } }, { a: 1, b: { c: 'new', d: true, e: 2 } });
  assert.deepEqual(owned, [
    { kind: 'key', path: ['b', 'c'], value: 'new', replaced: 'old' },
    { kind: 'key', path: ['b', 'e'], value: 2 },
  ]);
});

test('an owned part that is no longer produced drops out of the manifest', () => {
  const dir = project();
  apply(dir);
  assert.ok(readManifest(dir).shared['.claude/settings.json'].length);
  writeFileSync(path.join(dir, 'docs/guardrails/no-env.md'), guardrail('no-env', [{ tier: 1, check: 'env', run: 'advisory' }]));
  apply(dir);
  assert.equal(readManifest(dir).shared['.claude/settings.json']?.length ?? 0, 0);
});
