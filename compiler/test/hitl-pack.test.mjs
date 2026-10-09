import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
  assert.equal(entries[0].run, 'builtin:gate-command classes=irreversible,outward extra=""');
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
  assert.equal(run({ 'gated-classes': 'outward' })[0].run, 'builtin:gate-command classes=outward extra=""');
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
