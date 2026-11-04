// Plan drafting from a one-line goal (plan throughput T9): the plan parses, every step has a Check, the approval gates
// every step, and `run next` prints a self-contained brief. Runners are stubs; no model is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { draftPlan, approvePlan } from '../src/plan-draft.mjs';
import { readPlan, nextSteps, startStep } from '../src/plan.mjs';
import { startRun } from '../src/runs/record.mjs';
import { nextInRun } from '../src/runs/next.mjs';

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-draft-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return { dir, cleanup: () => { saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved); rmSync(base, { recursive: true, force: true }); } };
}

const planner = () => ({
  title: 'Add a widget',
  questions: [{ id: 'storage', prompt: 'Where?', options: [{ id: 'file', label: 'File', recommended: true, tradeoff: 'simple' }, { id: 'db', label: 'DB' }] }],
  steps: [
    { title: 'Model', class: 'implement', parallel: true, needs: [], files: ['src/model.mjs'], why: 'The widget needs a model.', do: 'Write src/model.mjs.', doneWhen: 'Model tests pass.', check: 'true' },
    { title: 'View', class: 'implement', parallel: true, needs: [], why: 'The widget needs a view.', do: 'Write src/view.mjs.', doneWhen: 'View tests pass.', check: 'true' },
    { title: 'Wire', class: 'implement', needs: ['1', '2'], why: 'Join them.', do: 'Edit src/index.mjs.', doneWhen: 'It runs.', check: 'true' },
  ],
});

test('a goal produces a plan that plan next parses, every step has a Check, with parallel markers', async () => {
  const s = setup();
  try {
    const r = await draftPlan(s.dir, 'Add a widget', { planner });
    const plan = readPlan(r.file);
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.steps.length, 3);
    assert.ok(plan.steps.every((x) => x.check));
    assert.deepEqual(nextSteps(plan).map((o) => [o.id, o.parallel]), [['1', true], ['2', true]]);
    assert.equal(r.defaulted.length, 1, 'the open question was defaulted through the T7 draft');
    assert.ok(existsSync(path.join(s.dir, 'docs/decisions', `${r.defaulted[0].draft}.md`)));
    await assert.rejects(draftPlan(s.dir, 'Add a widget', { planner }), /exists/);
  } finally { s.cleanup(); }
});

test('the built-in planner and reviewer draft a valid plan with no runner', async () => {
  const s = setup();
  try {
    const r = await draftPlan(s.dir, 'Fix the login bug');
    assert.deepEqual(readPlan(r.file).problems, []);
    assert.ok(readPlan(r.file).steps.every((x) => x.check));
  } finally { s.cleanup(); }
});

test('the reviewer can send a draft back once; a step without a Check is never written', async () => {
  const s = setup();
  try {
    const calls = [];
    const bad = () => ({ steps: [{ title: 'x', why: 'y', doneWhen: 'z', check: '' }] });
    const fixing = (req) => (calls.push(req.problems ?? null), req.problems ? planner() : bad());
    const r = await draftPlan(s.dir, 'Retry me', { planner: fixing });
    assert.equal(calls.length, 2);
    assert.ok(readPlan(r.file).steps.every((x) => x.check));
    await assert.rejects(draftPlan(s.dir, 'Always bad', { planner: bad }), /no Check/);
    assert.equal(existsSync(path.join(s.dir, 'docs/plans/always-bad.md')), false);
  } finally { s.cleanup(); }
});

test('a trigger stops the draft before any plan is written', async () => {
  const s = setup();
  try {
    const r = await draftPlan(s.dir, 'Risky', { planner, risk: { storage: { irreversible: 'drops the table' } } });
    assert.equal(r.stopped.triggers[0].trigger, 'hard-to-reverse');
    assert.equal(existsSync(path.join(s.dir, 'docs/plans/risky.md')), false);
  } finally { s.cleanup(); }
});

test('no step starts before the plan approval is recorded', async () => {
  const s = setup();
  try {
    const { file } = await draftPlan(s.dir, 'Add a widget', { planner });
    assert.match(readFileSync(file, 'utf8'), /\*\*Approval\*\*: pending/);
    assert.throws(() => startStep(s.dir, file, "1"), /no approval recorded/);
    approvePlan(file, { by: 'Sam', now: new Date('2026-11-04T00:00:00Z') });
    assert.match(readFileSync(file, 'utf8'), /\*\*Approval\*\*: approved 2026-11-04 by Sam/);
    assert.equal(startStep(s.dir, file, '1').changed, true);
  } finally { s.cleanup(); }
});

test('run next stops on an unapproved plan, then prints a brief naming files, why and done-when', async () => {
  const s = setup();
  try {
    const { file } = await draftPlan(s.dir, 'Add a widget', { planner });
    startRun(s.dir, { plan: 'docs/plans/add-a-widget.md', steps: ['1', '2', '3'] });
    assert.equal(nextInRun(s.dir, { record: false }).stop.code, 'plan-unapproved');
    approvePlan(file, { by: 'Sam' });
    const r = nextInRun(s.dir, { record: false });
    assert.equal(r.step.id, '1');
    assert.match(r.step.brief, /Why: The widget needs a model\./);
    assert.match(r.step.brief, /Files: .*src\/model\.mjs/);
    assert.match(r.step.brief, /Done-when: Model tests pass\./);
    assert.match(r.step.brief, /Goal of the plan: Add a widget/);
    assert.match(r.step.brief, /Check: true/);
  } finally { s.cleanup(); }
});
