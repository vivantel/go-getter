import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { gateEntries } from '../src/gate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const goldenFile = path.join(here, 'golden/hitl-pack.json');
const pack = loadPack(path.join(root, 'src/packs/hitl/pack.json'));
const recommended = { 'gated-classes': 'both', 'extra-patterns': [] };

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-hitl-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nhooks — x\nguardrail — x\n');
  writeFileSync(path.join(dir, 'docs/decisions/0043-human-escalation.md'), '---\nid: 0043-human-escalation\ntitle: Human escalation\nstatus: active\ndate: 2026-10-05\ntags: [hooks]\ntrack: process\n---\n\nx\n');
  return dir;
}
const adopt = (dir, answers = recommended) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-09' }) });
const snapshot = (dir, plan) => Object.fromEntries(plan.artifacts.map((a) => [a.path, readFileSync(path.join(dir, a.path), 'utf8')]).sort());

test('the hitl pack is valid and covers component 8', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'hitl' }), []);
  assert.deepEqual(pack.components, [8]);
});

test('every answer of the choice question renders a decision and a guardrail', () => {
  for (const o of pack.questions[0].options) {
    const dir = project();
    const plan = planRender({ root: dir, pack, answers: { ...recommended, 'gated-classes': o.id }, acceptedBy: 't', date: '2026-10-09' });
    assert.ok(plan.artifacts.some((a) => a.kind === 'decisions'), `${o.id} records a decision`);
    assert.ok(plan.artifacts.some((a) => a.kind === 'guardrails'), `${o.id} records a guardrail`);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the both answer yields a tier-2 gate-command guardrail grounded in decisions 0043 and the pack decision', () => {
  const dir = project();
  adopt(dir);
  const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'gated-actions-need-human-approval');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tier, 2);
  assert.equal(entries[0].run, 'builtin:gate-command classes=irreversible,outward extra="" free="" grantable="git-push, pr-create, pr-merge, pr-close"');
  const text = readFileSync(path.join(dir, 'docs/guardrails/gated-actions-need-human-approval.md'), 'utf8');
  assert.match(text, /grounded-in: \[\d{4}-gated-actions, 0043-human-escalation\]/);
  assert.match(text, /governed-by: \d{4}-gated-actions/);
  assert.match(text, /Hosts with project ask rules prompt natively/);
  assert.match(text, /skips permission prompts defeats the native rules/);
  assert.ok(gateEntries(entries).length > 10, 'the catalog is gated');
  rmSync(dir, { recursive: true, force: true });
});

test('narrower answers narrow the classes; extra patterns reach the gate; advisory-only has no gate', () => {
  const run = (answers) => {
    const dir = project();
    adopt(dir, { ...recommended, ...answers });
    const e = collectEnforcement(dir).filter((x) => x.guardrail === 'gated-actions-need-human-approval');
    rmSync(dir, { recursive: true, force: true });
    return e;
  };
  assert.equal(run({ 'gated-classes': 'outward' })[0].run, 'builtin:gate-command classes=outward extra="" free="" grantable="git-push, pr-create, pr-merge, pr-close"');
  assert.equal(run({ 'gated-classes': 'irreversible' })[0].run, 'builtin:gate-command classes=irreversible extra=""');
  const withExtra = run({ 'extra-patterns': ['make deploy', '/kubectl .*prod/'] })[0];
  assert.equal(withExtra.parsed.args.extra, 'make deploy, /kubectl .*prod/');
  assert.ok(gateEntries([withExtra]).some((e) => e.id === "extra:make deploy"));
  const advisory = run({ 'gated-classes': 'advisory-only' });
  assert.deepEqual(advisory.map((e) => e.tier), [1]);
  assert.deepEqual(gateEntries(advisory), []);
});

test('extra patterns reject a quote or a comma', () => {
  const dir = project();
  for (const bad of ['say "hi"', 'a,b']) {
    assert.throws(() => planRender({ root: dir, pack, answers: { ...recommended, 'extra-patterns': [bad] }, acceptedBy: 't' }), /pattern/);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('golden: the artifacts of the recommended path', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack, answers: recommended, acceptedBy: 'tester', date: '2026-10-09' });
  applyRender({ root: dir, plan });
  const actual = snapshot(dir, plan);
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
});

test('each narrower answer renders readable text and no dangling extra-patterns sentence', () => {
  for (const [answer, phrase] of [['both', 'the irreversible and outward-facing classes'], ['irreversible', 'the irreversible class'], ['outward', 'the outward-facing class']]) {
    const dir = project();
    const plan = planRender({ root: dir, pack, answers: { ...recommended, 'gated-classes': answer }, acceptedBy: 't', date: '2026-10-09' });
    const guardrail = plan.artifacts.find((a) => a.kind === 'guardrails');
    assert.match(guardrail.content, new RegExp(`Shell commands of ${phrase} need a human`), answer);
    assert.ok(plan.artifacts.every((a) => !/Extra patterns/.test(a.content)), answer);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('free-commands lets a chosen outward command through: no ask rule for it, the others stay', async () => {
  const { nativeRules } = await import('../src/gate.mjs');
  const { loadCapabilities } = await import('../src/capabilities.mjs');
  const dir = project();
  adopt(dir, { ...recommended, 'free-commands': ['git-push'], 'run-grants': [] });
  const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'gated-actions-need-human-approval');
  assert.match(entries[0].run, /free="git-push"/);
  const rules = nativeRules('claude-code', gateEntries(entries), loadCapabilities(root));
  assert.equal(rules.includes('Bash(git push *)'), false);
  assert.ok(rules.includes('Bash(git push --force*)') && rules.includes('Bash(git push --delete*)'), 'force-push and delete still ask');
  assert.ok(rules.includes('Bash(gh pr merge *)'), 'a merge still asks');
  assert.ok(readFileSync(path.join(dir, 'docs/decisions', readdirSync(path.join(dir, 'docs/decisions')).find((f) => /gated-free-commands/.test(f))), 'utf8').includes('[git-push]'));
  rmSync(dir, { recursive: true, force: true });
});

test('run-grants lists the shapes a run or a remembered approval may allow; the hook, not a static ask rule, decides them', async () => {
  const { nativeRules } = await import('../src/gate.mjs');
  const { loadCapabilities } = await import('../src/capabilities.mjs');
  const dir = project();
  adopt(dir, recommended);
  const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'gated-actions-need-human-approval');
  assert.match(entries[0].run, /grantable="git-push, pr-create, pr-merge, pr-close"/);
  const rules = nativeRules('claude-code', gateEntries(entries), loadCapabilities(root));
  for (const glob of ['Bash(gh pr merge *)', 'Bash(gh pr create *)', 'Bash(gh pr close *)', 'Bash(git push *)']) assert.equal(rules.includes(glob), false, glob);
  for (const glob of ['Bash(gh release create *)', 'Bash(git tag *)', 'Bash(npm publish *)', 'Bash(git push --force*)']) assert.ok(rules.includes(glob), `${glob} still asks`);
  const text = readFileSync(path.join(dir, 'docs/decisions', readdirSync(path.join(dir, 'docs/decisions')).find((f) => /gated-run-grants/.test(f))), 'utf8');
  assert.match(text, /Tags, releases, publishing and history rewrites always need a human/);
  rmSync(dir, { recursive: true, force: true });
  const bare = project();
  adopt(bare, { ...recommended, 'run-grants': [] });
  assert.match(collectEnforcement(bare).find((e) => e.guardrail === 'gated-actions-need-human-approval').run, /grantable=""/);
  rmSync(bare, { recursive: true, force: true });
});
