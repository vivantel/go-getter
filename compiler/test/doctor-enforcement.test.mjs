// H3 (enforcement-hardening): doctor exits non-zero and names the fix when enforcement is silently off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const hitl = loadPack(path.join(root, 'src/packs/hitl/pack.json'));

// An adopted project: the hitl pack rendered, then `apply` for Claude Code, as a fresh clone would hold it after setup.
function adopted() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-doctor-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nhooks — x\nroadmap — x\nguardrail — x\n');
  writeFileSync(path.join(dir, 'docs/decisions/0043-human-escalation.md'), '---\nid: 0043-human-escalation\ntitle: Human escalation\nstatus: active\ndate: 2026-10-05\ntags: [hooks]\ntrack: process\n---\n\nx\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack: hitl, answers: { 'gated-classes': 'both', 'extra-patterns': [], 'free-commands': [], 'run-grants': [] }, acceptedBy: 't', date: '2026-10-31' }) });
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir, env: cleanGitEnv(process.env) });
  const a = spawnSync(process.execPath, [cli, 'apply', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  return dir;
}
const doctor = (dir, env = {}) => spawnSync(process.execPath, [cli, 'doctor', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8', env: { ...process.env, HOME: path.join(dir, 'nohome'), ...env } });
const withProject = (fn) => () => { const dir = adopted(); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('a healthy adopted project passes doctor', withProject((dir) => {
  const r = doctor(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
}));

test('(a) Node below 22 fails doctor and names the floor', withProject((dir) => {
  const r = doctor(dir, { GO_GETTER_DOCTOR_NODE: '20.11.0' });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /Node 20\.11\.0 is below 22/);
}));

test('(b) a missing runner or vendored cli fails doctor with the one command that fixes it', withProject((dir) => {
  rmSync(path.join(dir, '.go-getter/cli'), { recursive: true, force: true });
  let r = doctor(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /enforcement is OFF/);
  assert.match(r.stdout + r.stderr, /go-getter apply/);
  rmSync(path.join(dir, '.go-getter/bin'), { recursive: true, force: true });
  r = doctor(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /\.go-getter\/bin\/go-getter/);
}));

test('(c) absent hook entries in the host settings fail doctor', withProject((dir) => {
  writeFileSync(path.join(dir, '.claude/settings.json'), '{}\n');
  const r = doctor(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /claude-code: no go-getter pre-tool hook in \.claude\/settings\.json/);
}));

test('(d) apply --check drift fails doctor', withProject((dir) => {
  writeFileSync(path.join(dir, '.go-getter/bin/go-getter'), `${readFileSync(path.join(dir, '.go-getter/bin/go-getter'), 'utf8')}\n# hand edit\n`);
  const r = doctor(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /out of date/);
  assert.match(r.stdout + r.stderr, /go-getter apply/);
}));

test('(e) a plugin version that differs from the CLI fails doctor', withProject((dir) => {
  const home = path.join(dir, 'home');
  mkdirSync(path.join(home, '.claude/plugins'), { recursive: true });
  writeFileSync(path.join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'go-getter@go-getter': [{ scope: 'user', version: '0.0.1' }] } }));
  const r = doctor(dir, { HOME: home });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /plugin is 0\.0\.1 but the CLI is/);
}));

test('a project that never adopted go-getter is not failed for missing enforcement', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-doctor-bare-'));
  try {
    const r = doctor(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ok(!existsSync(dir));
});
