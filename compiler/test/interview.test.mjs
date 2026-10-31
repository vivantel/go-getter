import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPackSchema, validatePack } from '../src/packs.mjs';
import { detectedValue, mergeInputs, nextQuestion, prefill, readSeed, resolveAnswers, validateInput } from '../src/interview.mjs';
import { tieredPack } from './support/tiered-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = tieredPack();

test('the fixture pack is valid', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack), []);
});

test('detected values come from a dotted path, and empty ones count as not detected', () => {
  const detect = { ci: { labels: ['a', 'b'] }, none: null, blank: '', empty: [] };
  assert.deepEqual(detectedValue(detect, 'ci.labels'), ['a', 'b']);
  for (const key of ['none', 'blank', 'empty', 'ci.missing', 'ci.labels.x', undefined]) assert.equal(detectedValue(detect, key), undefined, String(key));
});

test('a question proposes the recommended option, else the detected value, else the default', () => {
  const q = (id) => pack.questions.find((x) => x.id === id);
  assert.equal(prefill(q('isolation')), 'worktree');
  assert.equal(prefill(q('limit')), '3');
  assert.deepEqual(prefill(q('labels')), ['task']);
  assert.deepEqual(prefill(q('labels'), { ci: { labels: ['bug', 'task'] } }), ['bug', 'task'], 'detected items first, then defaults not already in them');
  assert.deepEqual(prefill(q('labels'), { ci: { labels: ['bug'] } }), ['bug', 'task']);
  assert.equal(prefill({ id: 'x', type: 'text', detect: 'a.b' }), undefined, 'neither detected nor a default');
});

test('next starts with a profile topic, offers customise, and says which questions it covers', () => {
  const r = nextQuestion(pack, {});
  assert.equal(r.done, false);
  assert.equal(r.kind, 'profile');
  assert.equal(r.topic, 'task-isolation');
  assert.deepEqual(r.profiles.map((p) => p.id), ['worktrees', 'clones', 'customise']);
  assert.equal(r.profiles.find((p) => p.recommended).id, 'worktrees');
  assert.deepEqual(r.questions.sort(), ['isolation', 'limit', 'location']);
});

test('a chosen profile fills its questions and they are not asked; the rest are', () => {
  const done = nextQuestion(pack, { profile: { 'task-isolation': 'worktrees' } });
  assert.equal(done.done, true, 'every remaining question is advanced, so none is asked');
  assert.equal(done.answers.isolation, 'worktree');
  assert.equal(done.answers.location, 'sibling');
  assert.equal(done.answers.limit, '4');
  assert.deepEqual(done.taken.filter((t) => t.source.startsWith('profile')).map((t) => t.question), ['isolation', 'location', 'limit']);
  assert.ok(done.taken.every((t) => t.source.startsWith('profile') || t.source === 'advanced default'));
});

test('customise asks the covered questions one by one, in order, with the gated one waiting for its gate', () => {
  const input = { profile: { 'task-isolation': 'customise' } };
  const first = nextQuestion(pack, input);
  assert.equal(first.question.id, 'isolation');
  assert.deepEqual(first.batch.map((q) => q.id), ['limit'], 'location waits on isolation; advanced questions are not asked');
  const second = nextQuestion(pack, { ...input, answers: { isolation: 'worktree' } });
  assert.equal(second.question.id, 'location');
  assert.deepEqual(second.batch.map((q) => q.id), ['limit']);
  const clone = nextQuestion(pack, { ...input, answers: { isolation: 'clone' } });
  assert.equal(clone.question.id, 'limit', 'location is inactive for a clone');
  assert.deepEqual(clone.batch, []);
});

test('explicit answers win over a profile, and a profile answer to an inactive question is dropped', () => {
  const r = resolveAnswers(pack, { profile: { 'task-isolation': 'worktrees' }, answers: { isolation: 'clone' } });
  assert.equal(r.answers.isolation, 'clone');
  assert.equal(r.answers.location, undefined, 'location is gated on a worktree');
  assert.equal(r.answers.limit, '4');
});

test('an advanced question takes detected, else default, else recommended, and --advanced asks it', () => {
  const input = { profile: { 'task-isolation': 'worktrees' }, detect: { ci: { labels: ['bug'] } } };
  const done = nextQuestion(pack, input);
  assert.deepEqual(done.answers.labels, ['bug', 'task']);
  assert.equal(done.answers.timeout, '30');
  assert.equal(done.answers.cap, 'on');
  const asked = nextQuestion(pack, input, { advanced: true });
  assert.equal(asked.question.id, 'timeout');
  assert.deepEqual(asked.batch.map((q) => q.id), ['labels', 'cap']);
  assert.deepEqual(asked.taken.map((t) => t.source).filter((s) => s === 'advanced default'), []);
});

test('an answered advanced question is kept, not replaced by its default', () => {
  const done = nextQuestion(pack, { profile: { 'task-isolation': 'worktrees' }, answers: { timeout: '5', cap: 'off' } });
  assert.equal(done.answers.timeout, '5');
  assert.equal(done.answers.cap, 'off');
  assert.ok(!done.taken.some((t) => t.question === 'timeout' || t.question === 'cap'));
});

test('next is a pure function: the same input gives the same output and the input is not changed', () => {
  const input = { answers: { isolation: 'worktree' }, profile: { 'task-isolation': 'customise' }, detect: { ci: { labels: ['x'] } } };
  const before = structuredClone(input);
  assert.deepEqual(nextQuestion(pack, input), nextQuestion(pack, input));
  assert.deepEqual(input, before);
});

test('a question view carries what a host needs to render it and names no host', () => {
  const { question } = nextQuestion(pack, { profile: { 'task-isolation': 'customise' } });
  assert.deepEqual(Object.keys(question).sort(), ['id', 'options', 'prefill', 'prompt', 'type']);
  assert.deepEqual(question.options[0], { id: 'worktree', label: 'Worktree', tradeoff: 'Cheap.', recommended: true });
  const text = nextQuestion(pack, { profile: { 'task-isolation': 'customise' }, answers: { isolation: 'clone' } }).question;
  assert.equal(text.pattern, '^\\d+$');
  assert.equal(text.prefill, '3');
  assert.doesNotMatch(JSON.stringify(nextQuestion(pack, {})), /claude|codex|cursor|kilo|copilot|gemini/i);
});

test('validate reports unknown questions, bad answers, unknown topics and profiles', () => {
  const errors = validateInput(pack, { answers: { nope: 'x', isolation: 'moat', limit: 'abc', labels: 'a' }, profile: { nowhere: 'a', 'task-isolation': 'ghosts' } });
  assert.equal(errors.length, 6);
  assert.match(errors.join('\n'), /answers\.nope: .*no such question/);
  assert.match(errors.join('\n'), /"moat" is not an option/);
  assert.match(errors.join('\n'), /does not match the pattern/);
  assert.match(errors.join('\n'), /takes an array of strings/);
  assert.match(errors.join('\n'), /profile\.nowhere: .*no such topic/);
  assert.match(errors.join('\n'), /"ghosts" is not a profile/);
  assert.deepEqual(validateInput(pack, { answers: { isolation: 'clone' }, profile: { 'task-isolation': 'customise' } }), []);
  assert.deepEqual(nextQuestion(pack, { answers: { isolation: 'moat' } }).errors?.length, 1, 'next refuses an invalid file');
});

test('a seed is data: unknown keys and unknown questions are refused, person and project keys are dropped', () => {
  assert.throws(() => readSeed(pack, { answers: {}, run: 'rm -rf /' }), /"run" is not a key/);
  assert.throws(() => readSeed(pack, { answers: { nope: 'x' } }), /no such question/);
  assert.throws(() => readSeed(pack, { answers: { isolation: 'moat' } }), /not an option/);
  assert.throws(() => readSeed(pack, []), /JSON object/);
  const seed = readSeed(pack, { answers: { isolation: 'clone' }, profile: { 'task-isolation': 'clones' }, acceptedBy: 'someone else', date: '1999-01-01', detect: { ci: {} } });
  assert.deepEqual(seed, { answers: { isolation: 'clone' }, profile: { 'task-isolation': 'clones' } });
});

test('layers merge key by key and the later layer wins', () => {
  const merged = mergeInputs({ answers: { a: 1, b: 2 }, profile: { t: 'x' } }, undefined, { answers: { b: 3 }, acceptedBy: 'me' });
  assert.deepEqual(merged, { answers: { a: 1, b: 3 }, profile: { t: 'x' }, acceptedBy: 'me' });
});

test('a question added since a version takes its fallback only when asked to', () => {
  const p = structuredClone(pack);
  p.questions.find((q) => q.id === 'limit').since = '0.1.0';
  const asked = resolveAnswers(p, { answers: { isolation: 'clone' } });
  assert.equal(asked.status.limit, 'unresolved');
  const rendered = resolveAnswers(p, { answers: { isolation: 'clone' } }, { sinceFallback: true });
  assert.equal(rendered.answers.limit, '3');
  assert.ok(!rendered.taken.some((t) => t.question === 'limit'));
});
