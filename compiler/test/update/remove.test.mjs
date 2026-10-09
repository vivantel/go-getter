// apply --remove (decision 0090): undo everything the manifest lists; guardrail owned-files-never-clobbered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, readlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planApply, applyPlan } from '../../src/apply.mjs';
import { readManifest, MANIFEST } from '../../src/manifest.mjs';
import { HOSTS } from '../../src/capabilities.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/go-getter.mjs');

function guardrail(id, tier, run) {
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: ${tier}\n      check: "c"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo it.\n`;
}

function project({ agents = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-remove-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  if (agents) writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nHand-written intro.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 3, 'builtin:file-max-lines path=AGENTS.md max=60'));
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets.md'), guardrail('no-secrets', 2, 'builtin:deny-path paths=secrets/**'));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(path.join(dir, '.claude/settings.json'), `${JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-hook.sh' }] }] } }, null, 2)}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'core.hooksPath', '.old-hooks'], { cwd: dir });
  return dir;
}

// Every file (content), symlink (target) and directory under the project, apart from .git.
function snapshot(dir, rel = '') {
  const out = {};
  for (const name of readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (r === '.git') continue;
    const stat = lstatSync(path.join(dir, r));
    if (stat.isSymbolicLink()) out[r] = `-> ${readlinkSync(path.join(dir, r))}`;
    else if (stat.isDirectory()) {
      out[`${r}/`] = 'dir';
      Object.assign(out, snapshot(dir, r));
    } else out[r] = readFileSync(path.join(dir, r), 'utf8');
  }
  return out;
}
const hooksPath = (dir) => execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
const gg = (dir, ...args) => spawnSync('node', [cli, 'apply', '--project', dir, ...args], { encoding: 'utf8' });
const adopt = (dir, hosts = HOSTS) => applyPlan(dir, planApply(dir, { hosts, skills: false }));

test('apply then apply --remove restores the project except docs/ and .go-getter/state', () => {
  const dir = project();
  mkdirSync(path.join(dir, '.go-getter/state'), { recursive: true });
  writeFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), '{}\n');
  const original = snapshot(dir);
  adopt(dir);
  assert.notDeepEqual(snapshot(dir), original);
  const res = gg(dir, '--remove');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(snapshot(dir), original);
  assert.equal(hooksPath(dir), '.old-hooks');
});

test('a project without AGENTS.md or a prior hooksPath is restored too', () => {
  const dir = project({ agents: false });
  execFileSync('git', ['config', '--local', '--unset', 'core.hooksPath'], { cwd: dir });
  const original = snapshot(dir);
  adopt(dir);
  assert.equal(gg(dir, '--remove').status, 0);
  assert.deepEqual(snapshot(dir), original);
  assert.throws(() => hooksPath(dir));
});

test('--dry-run prints the plan and writes nothing', () => {
  const dir = project();
  adopt(dir);
  const adopted = snapshot(dir);
  const res = gg(dir, '--remove', '--dry-run');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /delete \.githooks\/pre-push/);
  assert.match(res.stdout, /restore core\.hooksPath = \.old-hooks/);
  assert.match(res.stdout, new RegExp(`delete ${MANIFEST.replace('.', '\\.')}`));
  assert.deepEqual(snapshot(dir), adopted);
});

test('a modified file, key and block survive without --force and --force removes them', () => {
  const dir = project();
  adopt(dir, ['claude-code']);
  writeFileSync(path.join(dir, '.githooks/pre-push'), 'mine\n');
  writeFileSync(path.join(dir, 'AGENTS.md'), readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').replace('## Guardrails', '## My guardrails'));
  const m = readManifest(dir);
  m.shared['.claude/settings.json'].push({ kind: 'key', path: ['model'], value: 'x', replaced: 'old' });
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`);
  writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')), model: 'edited' }));

  const res = gg(dir, '--remove');
  assert.equal(res.status, 1);
  for (const what of ['\\.githooks/pre-push', 'AGENTS\\.md', '\\.claude/settings\\.json']) assert.match(res.stderr, new RegExp(`modified: ${what}`));
  assert.equal(readFileSync(path.join(dir, '.githooks/pre-push'), 'utf8'), 'mine\n');
  assert.match(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /My guardrails/);
  assert.equal(JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).model, 'edited');
  // everything unmodified went; the manifest keeps only the modified items
  assert.ok(!existsSync(path.join(dir, '.go-getter/bin')));
  const left = readManifest(dir);
  assert.deepEqual(Object.keys(left.files), ['.githooks/pre-push']);
  assert.deepEqual(Object.keys(left.shared).sort(), ['.claude/settings.json', 'AGENTS.md']);

  assert.equal(gg(dir, '--remove', '--force').status, 0);
  assert.ok(!existsSync(path.join(dir, '.githooks')));
  assert.ok(!existsSync(path.join(dir, MANIFEST)));
  assert.doesNotMatch(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /go-getter/);
  assert.equal(JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).model, 'old');
});

test('apply --remove without a manifest, or with a newer schema, changes nothing and fails', () => {
  const dir = project();
  const none = gg(dir, '--remove');
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /no \.go-getter\/manifest\.json/);
  adopt(dir);
  const m = readManifest(dir);
  m.schema = 99;
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(m)}\n`);
  const adopted = snapshot(dir);
  assert.notEqual(gg(dir, '--remove').status, 0);
  assert.deepEqual(snapshot(dir), adopted);
});

test('a manifest naming docs/ or a path outside the project is refused', () => {
  const dir = project();
  adopt(dir);
  const m = readManifest(dir);
  m.files['docs/guardrails/agents-cap.md'] = { hash: 'sha256:x' };
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(m)}\n`);
  const before = snapshot(dir);
  const res = gg(dir, '--remove', '--force');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /never removes/);
  assert.deepEqual(snapshot(dir), before);
});
