// The tiers and profiles the shipped packs declare (decisions 0150, 0151): which questions are advanced is a reviewed
// choice, so the set is pinned; a profile renders and reads back like the answers it expands to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';
import { nextQuestion, resolveAnswers } from '../src/interview.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id) => loadPack(path.join(root, 'src/packs', id, 'pack.json'));

const advancedOf = (id) => load(id).questions.filter((q) => q.tier === 'advanced').map((q) => q.id);

test('the advanced questions of the shipped packs are the reviewed set', () => {
  const shipped = Object.fromEntries(readdirSync(path.join(root, 'src/packs')).map((id) => [id, advancedOf(id)]).filter(([, ids]) => ids.length));
  assert.deepEqual(shipped, {
    'verification-gate': ['format-command', 'static-analysis-command', 'build-command', 'unit-command', 'integration-command', 'coverage-threshold', 'affected-command'],
    tracker: ['jira-issue-type'],
  });
});

// Asks every question of a pack the way the skill does: accept each prefill, until done. Returns the ids asked.
function walk(pack, input, options) {
  const asked = [];
  let state = structuredClone(input);
  for (let i = 0; i < 100; i++) {
    const r = nextQuestion(pack, state, options);
    assert.equal(r.errors, undefined, String(r.errors));
    if (r.done) return { asked, answers: r.answers, taken: r.taken };
    if (r.kind === 'profile') {
      state = { ...state, profile: { ...state.profile, [r.topic]: (r.profiles.find((p) => p.recommended) ?? r.profiles[0]).id } };
      continue;
    }
    asked.push(r.question.id);
    state = { ...state, answers: { ...state.answers, [r.question.id]: r.question.prefill } };
  }
  throw new Error('the interview did not finish');
}

test('verification-gate asks fewer questions by default than with --advanced, and keeps the advanced ones\' decisions', () => {
  const pack = load('verification-gate');
  const detect = { commands: { test: 'npm test', lint: 'npm run lint', format: 'prettier --check .', build: 'npm run build', unit: 'npm run test:unit' } };
  const quick = walk(pack, { detect });
  const full = walk(pack, { detect }, { advanced: true });
  const active = advancedOf('verification-gate').filter((id) => quick.answers[id] !== undefined);
  assert.ok(active.length >= 4, `the advanced questions that apply here: ${active.join()}`);
  for (const id of active) {
    assert.ok(!quick.asked.includes(id), `${id} is not asked by default`);
    assert.ok(full.asked.includes(id), `${id} is asked with --advanced`);
  }
  assert.ok(quick.asked.length < full.asked.length);
  assert.equal(quick.answers['format-command'], 'prettier --check .', 'a detected value is taken');
  assert.ok(quick.taken.some((t) => t.question === 'format-command' && t.source === 'advanced default'));
  const affected = walk(pack, { detect, answers: { checks: 'affected-tests' } });
  assert.equal(affected.answers['affected-command'], 'npm test', 'else the default');
  assert.ok(!affected.asked.includes('affected-command'));
});

test('orchestration asks which task-isolation approach first, then leaves out the questions the profile answers', () => {
  const pack = load('orchestration');
  const first = nextQuestion(pack, {});
  assert.equal(first.kind, 'profile');
  assert.equal(first.topic, 'task-isolation');
  assert.deepEqual(first.profiles.map((p) => p.id), ['worktrees', 'one-tree-in-turn', 'no-isolation', 'customise']);
  assert.equal(first.profiles.find((p) => p.recommended).id, 'worktrees');
  const withProfile = walk(pack, {});
  assert.ok(!withProfile.asked.some((id) => ['isolation', 'worktree-location', 'max-concurrent'].includes(id)), withProfile.asked.join());
  const custom = walk(pack, { profile: { 'task-isolation': 'customise' } });
  assert.ok(['isolation', 'worktree-location', 'max-concurrent'].every((id) => custom.asked.includes(id)));
});

function project(tags) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-shipped-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), `# Tags\n\n${[...tags].map((t) => `${t} — x`).join('\n')}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

for (const profile of load('orchestration').profiles.map((p) => p.id)) {
  test(`orchestration profile ${profile}: renders one decision per answer and the answers read back`, () => {
    const pack = load('orchestration');
    const answers = { ...walk(pack, { profile: { 'task-isolation': profile } }).answers };
    const expected = pack.profiles.find((p) => p.id === profile).answers;
    for (const [q, v] of Object.entries(expected)) assert.equal(answers[q], v, `${q} comes from the profile`);
    const tags = new Set(JSON.stringify(pack.outputs).match(/"tags":\s*\[[^\]]*\]/g)?.flatMap((m) => JSON.parse(`{${m}}`).tags) ?? []);
    const dir = project(tags);
    try {
      const resolved = resolveAnswers(pack, { profile: { 'task-isolation': profile }, answers });
      applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: resolved.answers, acceptedBy: 't', date: '2026-10-31' }) });
      const back = currentAnswers(adoptedArtifacts(dir, 'orchestration'));
      for (const [q, v] of Object.entries(expected)) if (back[q] !== undefined || q !== 'worktree-location') assert.deepEqual(back[q], v, `${q} reads back`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
