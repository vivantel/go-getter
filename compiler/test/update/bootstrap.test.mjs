// Bootstrapping a manifest for a project adopted with the pre-manifest apply (decisions 0090, 0089).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planApply, applyPlan, bootstrap } from '../../src/apply.mjs';
import { readManifest, MANIFEST } from '../../src/manifest.mjs';
import { HOSTS } from '../../src/capabilities.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/go-getter.mjs');

function guardrail(id, tier, run) {
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: ${tier}\n      check: "c"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo it.\n`;
}

// A project adopted by apply before manifests existed: apply, then forget the manifest.
function legacyProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-bootstrap-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nHand-written intro.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 3, 'builtin:file-max-lines path=AGENTS.md max=60'));
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets.md'), guardrail('no-secrets', 2, 'builtin:deny-path paths=secrets/**'));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(path.join(dir, '.claude/settings.json'), `${JSON.stringify({ model: 'x' }, null, 2)}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const plan = planApply(dir, { hosts: HOSTS, skills: false });
  applyPlan(dir, plan);
  const adopted = readManifest(dir);
  rmSync(path.join(dir, MANIFEST));
  return { dir, plan, adopted };
}

const opts = { hosts: HOSTS, skills: false };
const gg = (dir, ...args) => spawnSync('node', [cli, 'apply', '--project', dir, ...args], { encoding: 'utf8' });

test('a project adopted before manifests gets a manifest that owns every output', () => {
  const { dir, plan, adopted } = legacyProject();
  const m = bootstrap(dir, opts);
  assert.equal(m.schema, 1);
  const listed = [...Object.keys(m.files), ...Object.keys(m.shared).filter((k) => k !== 'git-config')].sort();
  assert.deepEqual(listed, Object.keys(plan.outputs).sort());
  assert.deepEqual(m.files, adopted.files);
  assert.deepEqual(m.shared['AGENTS.md'].map((b) => b.hash), adopted.shared['AGENTS.md'].map((b) => b.hash));
  // owned hook entries are the ones the real manifest has; replaced values of keys are unknown
  const hooks = (x) => x.shared['.claude/settings.json'].filter((i) => i.kind === 'items');
  assert.deepEqual(hooks(m), hooks(adopted));
  assert.ok(m.shared['git-config'][0].unknown);
  assert.ok(!m.shared['.claude/settings.json'].some((i) => i.path[0] === 'model'));
});

test('an edited file is recorded as go-getter\'s and so reported modified, never overwritten', () => {
  const { dir } = legacyProject();
  writeFileSync(path.join(dir, '.githooks/pre-push'), 'mine\n');
  bootstrap(dir, opts);
  const res = gg(dir, '--hosts', 'all', '--no-skills');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /modified: \.githooks\/pre-push/);
  assert.equal(readFileSync(path.join(dir, '.githooks/pre-push'), 'utf8'), 'mine\n');
});

test('a second bootstrap changes nothing, and apply after it is clean', () => {
  const { dir } = legacyProject();
  bootstrap(dir, opts);
  const first = readFileSync(path.join(dir, MANIFEST), 'utf8');
  bootstrap(dir, opts);
  assert.equal(readFileSync(path.join(dir, MANIFEST), 'utf8'), first);
  assert.equal(gg(dir, '--hosts', 'all', '--no-skills').status, 0);
  assert.equal(gg(dir, '--hosts', 'all', '--no-skills', '--check').status, 0);
});

test('apply --remove after a bootstrap removes the files and hook entries it recorded', () => {
  const { dir } = legacyProject();
  bootstrap(dir, opts);
  const res = gg(dir, '--remove');
  assert.equal(res.status, 0, res.stderr);
  const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings, { model: 'x' });
  assert.doesNotMatch(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /go-getter/);
});
