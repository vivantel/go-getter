// Regressions found in review of the manifest, update and remove work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planApply, applyPlan, bootstrap } from '../../src/apply.mjs';
import { readManifest, MANIFEST } from '../../src/manifest.mjs';
import { planRemove, applyRemove } from '../../src/remove.mjs';
import { planUpdate, runUpdate } from '../../src/update.mjs';
import { parseFrontmatter } from '../../src/frontmatter.mjs';
import { loadPack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';
import { HOSTS } from '../../src/capabilities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../../bin/go-getter.mjs');
const repo = path.resolve(here, '../../..');

const guardrail = (id, tier, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: ${tier}\n      check: "c"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo it.\n`;

function project({ hooksPath } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-review-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', 3, 'builtin:file-max-lines path=AGENTS.md max=60'));
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets.md'), guardrail('no-secrets', 2, 'builtin:deny-path paths=secrets/**'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (hooksPath) execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: dir });
  return dir;
}
const apply = (dir, opts = {}) => applyPlan(dir, planApply(dir, { skills: false, ...opts }));
const hooksPath = (dir) => spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).stdout.trim();

test('applying for some hosts leaves the other hosts\' files and manifest records alone', () => {
  const dir = project();
  apply(dir, { hosts: ['claude-code', 'codex'] });
  const full = readManifest(dir);
  assert.ok(existsSync(path.join(dir, '.claude/settings.json')));
  const plan = planApply(dir, { hosts: ['codex'], skills: false });
  assert.equal(plan.stale.some((p) => p.startsWith('.claude/')), false);
  applyPlan(dir, plan);
  assert.ok(existsSync(path.join(dir, '.claude/settings.json')));
  assert.ok(existsSync(path.join(dir, 'CLAUDE.md')));
  const after = readManifest(dir);
  assert.deepEqual(after.shared['.claude/settings.json'], full.shared['.claude/settings.json']);
  assert.ok(after.files['CLAUDE.md']);
  // and remove still undoes the Claude hook entries
  const rm = planRemove(dir);
  applyRemove(dir, rm);
  assert.equal(existsSync(path.join(dir, '.claude/settings.json')), false);
  assert.equal(existsSync(path.join(dir, 'CLAUDE.md')), false);
});

test('a legacy project with older generated files is refreshed by the first update, without --force', () => {
  const dir = project();
  apply(dir, { hosts: HOSTS });
  const runner = path.join(dir, '.go-getter/bin/go-getter');
  writeFileSync(runner, readFileSync(runner, 'utf8').replace('FLOOR=22', 'FLOOR=20'));
  const agents = path.join(dir, 'AGENTS.md');
  writeFileSync(agents, readFileSync(agents, 'utf8').replace(/(<!-- go-getter:start -->\n)/, '$1Old line.\n'));
  rmSync(path.join(dir, MANIFEST));
  const plan = planUpdate(dir, { root: repo, date: '2026-10-09' });
  assert.deepEqual(plan.modified, []);
  assert.ok(plan.changed.includes('.go-getter/bin/go-getter'));
  assert.ok(plan.changed.includes('AGENTS.md'));
  runUpdate(dir, { root: repo, date: '2026-10-09' });
  assert.match(readFileSync(runner, 'utf8'), /FLOOR=22/);
  assert.doesNotMatch(readFileSync(agents, 'utf8'), /Old line/);
});

test('a file at a generated path that go-getter did not generate is still reported modified', () => {
  const dir = project();
  apply(dir, { hosts: HOSTS });
  writeFileSync(path.join(dir, '.githooks/pre-push'), '#!/bin/sh\necho mine\n');
  rmSync(path.join(dir, MANIFEST));
  const plan = planUpdate(dir, { root: repo, date: '2026-10-09' });
  assert.deepEqual(plan.modified.map((m) => m.path), ['.githooks/pre-push']);
});

test('remove keeps a core.hooksPath whose previous value is unknown', () => {
  const own = project({ hooksPath: '.githooks' });
  apply(own, { hosts: HOSTS });
  assert.equal(readManifest(own).shared['git-config'][0].unknown, true);
  applyRemove(own, planRemove(own));
  assert.equal(hooksPath(own), '.githooks');

  const legacy = project();
  apply(legacy, { hosts: HOSTS });
  rmSync(path.join(legacy, MANIFEST));
  bootstrap(legacy, { hosts: HOSTS, skills: false });
  applyRemove(legacy, planRemove(legacy));
  assert.equal(hooksPath(legacy), '.githooks');

  const fresh = project();
  apply(fresh, { hosts: HOSTS });
  assert.equal(readManifest(fresh).shared['git-config'][0].unknown, undefined);
  applyRemove(fresh, planRemove(fresh));
  assert.equal(hooksPath(fresh), '');
});

test('a user\'s own CLAUDE.md link to elsewhere is not recorded as go-getter\'s', () => {
  const dir = project();
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/CLAUDE.md'), 'mine\n');
  symlinkSync('docs/CLAUDE.md', path.join(dir, 'CLAUDE.md'));
  apply(dir, { hosts: HOSTS });
  assert.equal(readManifest(dir).files['CLAUDE.md'], undefined);
  applyRemove(dir, planRemove(dir, { force: true }));
  assert.ok(lstatSync(path.join(dir, 'CLAUDE.md')).isSymbolicLink());
});

test('a key recorded as unknown stays unknown when go-getter\'s value for it changes', () => {
  const dir = project();
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  apply(dir, { hosts: ['claude-code'] });
  const file = path.join(dir, MANIFEST);
  const m = readManifest(dir);
  // pretend a key was recorded by a bootstrap: its value then differs from what go-getter wants now
  const settings = path.join(dir, '.claude/settings.json');
  const json = JSON.parse(readFileSync(settings, 'utf8'));
  json.cleanupPeriodDays = 1;
  writeFileSync(settings, `${JSON.stringify(json, null, 2)}\n`);
  m.shared['.claude/settings.json'].push({ kind: 'key', path: ['cleanupPeriodDays'], value: 1, unknown: true });
  writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
  const recorded = planApply(dir, { hosts: ['claude-code'], skills: false });
  // go-getter now wants another value for that key
  const want = JSON.parse(recorded.outputs['.claude/settings.json'].content);
  want.cleanupPeriodDays = 2;
  recorded.outputs['.claude/settings.json'] = { content: `${JSON.stringify(want, null, 2)}\n` };
  applyPlan(dir, recorded);
  const item = readManifest(dir).shared['.claude/settings.json'].find((i) => i.path?.join('.') === 'cleanupPeriodDays');
  assert.equal(item.unknown, true);
  assert.equal(item.replaced, undefined);
});

test('update proposes new decisions as drafts and does not need an accepted-by', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gg-review-root-'));
  const v1 = loadPack(path.join(here, '../fixtures/packs/example/pack.json'));
  const v2 = structuredClone(v1);
  v2.version = '0.2.0';
  v2.questions.push({ id: 'extra', since: '0.2.0', prompt: 'Extra?', options: [{ id: 'yes', label: 'Yes', tradeoff: 'More.', recommended: true }, { id: 'no', label: 'No', tradeoff: 'Less.' }] });
  v2.outputs.extra = { yes: { decisions: [{ slug: 'extra-rule', title: 'An extra rule', tags: ['configuration'], frontmatter: { track: 'process' }, body: 'Do it.\n' }] } };
  mkdirSync(path.join(root, 'src/packs/example'), { recursive: true });
  writeFileSync(path.join(root, 'src/packs/example/pack.json'), JSON.stringify(v2));
  const dir = project();
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\nguardrail — g\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack: v1, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'yes' }, acceptedBy: 't', date: '2026-10-05' }) });
  // no adopted artifact carries accepted-by once the decision is draft
  const decision = path.join(dir, 'docs/decisions/0001-instruction-file-cap.md');
  writeFileSync(decision, readFileSync(decision, 'utf8').replace('status: active', 'status: draft').replace(/accepted-by: .*\n/, ''));
  applyPlan(dir, planApply(dir, { skills: false }));
  runUpdate(dir, { root, date: '2026-10-09' });
  const added = parseFrontmatter(readFileSync(path.join(dir, 'docs/decisions/0002-extra-rule.md'), 'utf8')).data;
  assert.equal(added.status, 'draft');
  assert.equal(added['accepted-by'], undefined);
  assert.match(readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8'), /0002-extra-rule,.*,draft/);
});

test('the update plan ignores nested node_modules and keeps the git state of a worktree copy', () => {
  const dir = project();
  mkdirSync(path.join(dir, 'pkg/node_modules/x'), { recursive: true });
  writeFileSync(path.join(dir, 'pkg/node_modules/x/a.js'), 'x');
  apply(dir, { hosts: HOSTS });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/o/r.git'], { cwd: dir });
  const plan = planUpdate(dir, { root: repo, date: '2026-10-09' });
  assert.deepEqual(plan.removed, []);
  assert.equal(plan.git, false);
});

test('update returns the apply notes about gated patterns that still run unprompted', () => {
  const dir = project();
  writeFileSync(path.join(dir, 'docs/guardrails/gated.md'), guardrail('gated', 2, 'builtin:gate-command classes=outward'));
  writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({ permission: 'allow' }));
  const { notes } = runUpdate(dir, { root: repo, date: '2026-10-09' });
  assert.ok(notes.some((n) => /^opencode\.json: \d+ gated pattern\(s\) still run without a prompt on opencode/.test(n)), notes.join('\n'));
  rmSync(dir, { recursive: true, force: true });
});
