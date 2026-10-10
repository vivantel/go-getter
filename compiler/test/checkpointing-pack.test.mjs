import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { checkpointConfig } from '../src/checkpoint-trigger.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const goldenFile = path.join(here, 'golden/checkpointing-pack.json');
const pack = loadPack(path.join(root, 'src/packs/checkpointing/pack.json'));
const recommended = { creation: 'hook-and-instruction', triggers: ['gated-action'], retention: '10' };

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-cppack-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nhooks — x\nguardrail — x\nprocedural — x\n');
  writeFileSync(path.join(dir, 'docs/decisions/0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions.md'), '---\nid: 0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions\ntitle: Checkpoints\nstatus: active\ndate: 2026-10-10\ntags: [hooks]\ntrack: process\n---\n\nx\n');
  return dir;
}
const adopt = (dir, answers = recommended) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-10' }) });

test('the checkpointing pack is valid, covers component 9 and requires hitl', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'checkpointing' }), []);
  assert.deepEqual(pack.components, [9]);
  assert.deepEqual(pack.requires, ['hitl']);
});

test('the recommended path renders a decision, a tier-2 guardrail with a tier-1 fallback, and a procedure', () => {
  const dir = project();
  adopt(dir);
  const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'checkpoint-before-gated-action');
  assert.deepEqual(entries.map((e) => e.tier), [2, 1]);
  assert.equal(entries[0].run, 'builtin:checkpoint-before-gated triggers="gated-action" keep=10');
  const config = checkpointConfig(collectEnforcement(dir));
  assert.deepEqual([...config.triggers], ['gated-action']);
  assert.equal(config.keep, 10);
  const procedure = readFileSync(path.join(dir, 'docs/skills/restoring-a-checkpoint.md'), 'utf8');
  assert.match(procedure, /operationalizes:\s*\n?\s*-?\s*\[?checkpoint-before-gated-action/);
  assert.match(procedure, /go-getter checkpoint restore/);
  rmSync(dir, { recursive: true, force: true });
});

test('both triggers and keeping all reach the hook configuration', () => {
  const dir = project();
  adopt(dir, { creation: 'hook-and-instruction', triggers: ['gated-action', 'plan-step'], retention: 'all' });
  const config = checkpointConfig(collectEnforcement(dir));
  assert.deepEqual([...config.triggers].sort(), ['gated-action', 'plan-step']);
  assert.equal(config.keep, Infinity);
  rmSync(dir, { recursive: true, force: true });
});

test('instruction only has no tier-2 entry and no hook configuration', () => {
  const dir = project();
  adopt(dir, { creation: 'instruction-only' });
  const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'checkpoint-before-gated-action');
  assert.deepEqual(entries.map((e) => e.tier), [1]);
  assert.equal(checkpointConfig(collectEnforcement(dir)), null);
  rmSync(dir, { recursive: true, force: true });
});

test('golden: the artifacts of the recommended path', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack, answers: recommended, acceptedBy: 'tester', date: '2026-10-10' });
  applyRender({ root: dir, plan });
  const actual = Object.fromEntries(plan.artifacts.map((a) => [a.path, readFileSync(path.join(dir, a.path), 'utf8')]).sort());
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
});
