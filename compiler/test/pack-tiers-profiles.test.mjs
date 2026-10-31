// Pack validation for decision 0151 (tiers and their limits) and decision 0150 (profiles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPackSchema, validatePack, validateAllPacks } from '../src/packs.mjs';
import { tieredPack } from './support/tiered-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const schema = loadPackSchema(root);
const errorsOf = (pack) => validatePack(schema, pack);
const question = (pack, id) => pack.questions.find((q) => q.id === id);

const guardrail = (slug) => ({ guardrails: [{ slug, title: slug, tags: ['guardrail'], frontmatter: {}, enforcement: [{ tier: 1, check: 'Instruction only' }], body: 'x\n' }] });

test('a pack with tiers and profiles is valid, and every shipped pack still is', () => {
  assert.deepEqual(errorsOf(tieredPack()), []);
  assert.deepEqual(validateAllPacks(root), []);
});

test('tier takes basic or advanced only', () => {
  const pack = tieredPack();
  question(pack, 'limit').tier = 'optional';
  assert.ok(errorsOf(pack).length);
});

test('an advanced text or list question needs a default, not only a detect key', () => {
  const pack = tieredPack();
  const q = question(pack, 'timeout');
  delete q.default;
  q.detect = 'ci.timeout';
  assert.ok(errorsOf(pack).some((e) => e.includes('$.questions[3].tier') && e.includes('has no default')));
  question(pack, 'limit').tier = 'basic';
  assert.ok(!errorsOf(pack).some((e) => e.includes('$.questions[2]')), 'a basic question may rely on detect alone');
});

test('a choice question whose options produce different guardrails stays basic', () => {
  const pack = tieredPack();
  pack.outputs.cap.on = { ...pack.outputs.cap.on, ...guardrail('cap-holds') };
  assert.ok(errorsOf(pack).some((e) => e.includes('changes which guardrails')));
  pack.outputs.cap.off = { ...pack.outputs.cap.off, ...guardrail('cap-holds') };
  assert.deepEqual(errorsOf(pack), [], 'the same guardrail whichever option is chosen is not an on/off switch');
  pack.outputs.cap.off = { ...pack.outputs.cap.off, ...guardrail('another') };
  assert.ok(errorsOf(pack).some((e) => e.includes('changes which guardrails')));
});

test('questions of packs that set how data, secrets or gated commands are handled stay basic', () => {
  for (const id of ['hitl', 'restricted-data', 'data-policy', 'sanitization']) {
    const pack = { ...tieredPack(), id };
    assert.ok(errorsOf(pack).some((e) => e.includes(`pack "${id}"`)), id);
  }
  assert.ok(!errorsOf({ ...tieredPack(), id: 'tiered' }).length);
});

test('a profile must answer questions of its own pack with valid answers', () => {
  const unknown = tieredPack();
  unknown.profiles[0].answers.ghost = 'x';
  assert.ok(errorsOf(unknown).some((e) => e.includes('answers.ghost: no such question')));
  const bad = tieredPack();
  bad.profiles[0].answers.isolation = 'moat';
  assert.ok(errorsOf(bad).some((e) => e.includes('"moat" is not an option')));
  const pattern = tieredPack();
  pattern.profiles[1].answers.limit = 'many';
  assert.ok(errorsOf(pattern).some((e) => e.includes('does not match the pattern')));
});

test('profiles of a topic are alternatives: one id each, at most one recommended, and customise is reserved', () => {
  const dup = tieredPack();
  dup.profiles[1].id = 'worktrees';
  assert.ok(errorsOf(dup).some((e) => e.includes('duplicate profile')));
  const two = tieredPack();
  two.profiles[1].recommended = true;
  assert.ok(errorsOf(two).some((e) => e.includes('already has a recommended profile')));
  const reserved = tieredPack();
  reserved.profiles[1].id = 'customise';
  assert.ok(errorsOf(reserved).some((e) => e.includes('"customise" is reserved')));
});

test('a question belongs to one topic', () => {
  const pack = tieredPack();
  pack.profiles.push({ topic: 'limits', id: 'low', label: 'Low', tradeoff: 'Few.', answers: { limit: '1' } });
  assert.ok(errorsOf(pack).some((e) => e.includes('already covered by topic "task-isolation"')));
});

test('a profile needs answers, a label and a tradeoff', () => {
  for (const key of ['label', 'tradeoff', 'answers', 'topic', 'id']) {
    const pack = tieredPack();
    delete pack.profiles[0][key];
    assert.ok(errorsOf(pack).length, key);
  }
  const empty = tieredPack();
  empty.profiles[0].answers = {};
  assert.ok(errorsOf(empty).length);
});
