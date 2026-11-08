import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parsePlan, nextSteps, crossPlanProblems, effectiveScope, unitStates, planFiles } from '../src/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const requireText = (rel) => readFileSync(path.join(root, rel), 'utf8');

const UNIT = `# Feature alpha
Owner-id: dana
Accept: human review by dana
Budget: 5 days

Prose that is not a header.

## Phase A — Headed
Id: A
Owner: agent · Priority: 3
Flag: alpha-flag

### A1 First — [ ]
Class: implement · Needs: none · Scope: \`src/a/**\`, shared-schema · Owner: human · Priority: 2 · Check: \`true\`
Accept: \`node --test\`
Do: change compiler/src/thing.mjs only.

### A2 Second — [ ]
Needs: A1, beta#B1, A
Parent: alpha#A

## Phase B — Unheaded

### B1 Loose step — [ ]
Do: edit docs/x.md.
`;

test('a step parses every unit field and defaults the ones it omits', () => {
  const plan = parsePlan(UNIT, 'alpha.md');
  assert.deepEqual(plan.problems.filter((p) => !/beta#B1/.test(p)), []);
  const [a1, a2, b1] = plan.steps;
  assert.deepEqual(a1.scope, ['src/a/**', 'shared-schema']);
  assert.equal(a1.owner, 'human');
  assert.equal(a1.priority, 2);
  assert.equal(a1.accept, 'node --test');
  assert.equal(a1.unit, 'alpha#A1');
  assert.deepEqual([a2.owner, a2.priority, a2.scope, a2.accept, a2.flag, a2.budget], ['either', 0, undefined, undefined, undefined, undefined]);
  assert.equal(a2.parent, 'alpha#A');
  assert.equal(a1.parent, 'alpha#A');
  assert.equal(b1.parent, 'alpha');
  assert.equal(b1.claimable, true);
});

test('a plan header and a feature header are parsed with their ids', () => {
  const { feature, plans } = parsePlan(UNIT, 'alpha.md');
  assert.equal(feature.unit, 'alpha');
  assert.equal(feature.claimable, true);
  assert.deepEqual([feature.ownerId, feature.accept, feature.budget], ['dana', 'human review by dana', '5 days']);
  const [a] = plans;
  assert.deepEqual([a.id, a.unit, a.owner, a.priority, a.flag, a.claimable], ['A', 'alpha#A', 'agent', 3, 'alpha-flag', true]);
});

test('Owner-id is inherited from the plan and the feature', () => {
  const { steps } = parsePlan(UNIT, 'alpha.md');
  assert.deepEqual(steps.map((s) => s.ownerId), ['dana', 'dana', 'dana']);
});

test('an unheaded plan is unclaimable and its steps stay claimable', () => {
  const { plans, steps } = parsePlan(UNIT, 'alpha.md');
  const b = plans[1];
  assert.deepEqual([b.claimable, b.unit], [false, null]);
  assert.equal(steps.find((s) => s.id === 'B1').claimable, true);
  const bare = parsePlan('# Old plan\n\n## Phase 1\n\n### 1.1 Step — [ ]\nNeeds: none\n', 'old.md');
  assert.equal(bare.feature.claimable, false);
  assert.equal(bare.plans[0].claimable, false);
  assert.equal(bare.steps[0].claimable, true);
  assert.deepEqual(bare.problems, []);
});

test('a unit without Scope falls back to the paths its Do text names', () => {
  const { steps } = parsePlan(UNIT, 'alpha.md');
  assert.deepEqual(effectiveScope(steps[0]), ['src/a/**', 'shared-schema']);
  assert.deepEqual(effectiveScope(steps[2]), ['docs/x.md']);
});

test('bad unit fields are refused by name', () => {
  const text = '# P\n\n### 1 S — [ ]\nOwner: robot · Priority: high · Parent: #\n';
  const { problems } = parsePlan(text, 'p.md');
  assert.ok(problems.some((p) => /unknown Owner "robot"/.test(p)));
  assert.ok(problems.some((p) => /Priority "high" that is not an integer/.test(p)));
  assert.ok(problems.some((p) => /malformed Parent/.test(p)));
});

test('a plan id may not collide with a step id of its file', () => {
  const { problems } = parsePlan('# P\n\n## Phase\nId: 1\n\n### 1 S — [ ]\n', 'p.md');
  assert.ok(problems.some((p) => /plan id 1 is already used by a step/.test(p)));
});

const FILES = {
  'alpha.md': '# Alpha\n\n## Phase A\nId: A\n\n### A1 One — [ ]\nNeeds: beta#B1\n\n### A2 Two — [ ]\nNeeds: beta#B2, A1\nParent: beta#B\n',
  'beta.md': '# Beta\n\n## Phase B\nId: B\n\n### B1 One — [x]\n\n### B2 Two — [ ]\nNeeds: none\n',
};
const parsedFrom = (files) => Object.entries(files).map(([name, text]) => parsePlan(text, `docs/plans/${name}`));

test('a cross-plan Needs and Parent resolve', () => {
  const parsed = parsedFrom(FILES);
  assert.deepEqual(parsed.flatMap((p) => p.problems), []);
  assert.deepEqual(crossPlanProblems(parsed), []);
});

test('an unknown cross-plan id and an unknown stem are rejected', () => {
  const files = { ...FILES, 'alpha.md': FILES['alpha.md'] + '\n### A3 Three — [ ]\nNeeds: beta#B9, gamma#G1\n' };
  const problems = crossPlanProblems(parsedFrom(files));
  assert.ok(problems.some((p) => /step A3 needs unknown unit beta#B9/.test(p)));
  assert.ok(problems.some((p) => /step A3 needs gamma#G1, but no plan has the stem "gamma"/.test(p)));
});

test('a cycle across plans is rejected', () => {
  const files = {
    'alpha.md': '# Alpha\n\n### A1 One — [ ]\nNeeds: beta#B1\n',
    'beta.md': '# Beta\n\n### B1 One — [ ]\nNeeds: alpha#A1\n',
  };
  const parsed = parsedFrom(files);
  assert.deepEqual(parsed.flatMap((p) => p.problems), []);
  assert.ok(crossPlanProblems(parsed).some((p) => /dependency cycle across plans/.test(p) && /alpha#A1/.test(p) && /beta#B1/.test(p)));
});

test('a cycle inside one file is still reported by the file, not twice', () => {
  const parsed = parsedFrom({ 'alpha.md': '# Alpha\n\n### A1 One — [ ]\nNeeds: A2\n\n### A2 Two — [ ]\nNeeds: alpha#A1\n' });
  assert.ok(parsed[0].problems.some((p) => /dependency cycle/.test(p)));
  assert.deepEqual(crossPlanProblems(parsed), []);
});

test('nextSteps offers a step only when its cross-plan Needs are done', () => {
  const [alpha] = parsedFrom(FILES);
  const states = (b1) => new Map([['beta#B1', b1], ['beta#B2', 'pending']]);
  assert.deepEqual(nextSteps(alpha, 4, states('pending')).map((o) => o.id), []);
  assert.deepEqual(nextSteps(alpha, 4, states('done')).map((o) => o.id), ['A1']);
});

test('nextSteps lists the unit fields only when a step sets them', () => {
  const plan = parsePlan(UNIT, 'alpha.md');
  const [a1, a2] = nextSteps({ ...plan, steps: plan.steps.filter((s) => s.id !== 'A2') }, 4, new Map());
  assert.deepEqual([a1.owner, a1.priority, a1.scope], ['human', 2, ['src/a/**', 'shared-schema']]);
  assert.equal(a2.owner, undefined);
  assert.deepEqual(Object.keys(a2).sort(), ['class', 'doneWhen', 'id', 'option', 'parallel', 'title']);
});

test('check plans reports a cross-plan problem and passes the repository plans', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-plan-unit-'));
  try {
    mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
    for (const [name, text] of Object.entries(FILES)) writeFileSync(path.join(dir, 'docs/plans', name), text);
    const ok = spawnSync(process.execPath, [cli, 'check', 'plans', '--project', dir], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    writeFileSync(path.join(dir, 'docs/plans/alpha.md'), FILES['alpha.md'].replace('beta#B1', 'beta#B7'));
    const bad = spawnSync(process.execPath, [cli, 'check', 'plans', '--project', dir], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /needs unknown unit beta#B7/);
    assert.deepEqual([...unitStates(dir)].filter(([id]) => id === 'beta#B1'), [['beta#B1', 'done']]);
    assert.ok(planFiles(dir).length === 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the repository plans carry the restored cross-plan Needs and no blocked step', () => {
  const plans = planFiles(root).filter((f) => !f.includes('archive')).map((f) => parsePlan(requireText(f), f));
  const step = (stem, id) => plans.find((p) => p.stem === stem).steps.find((s) => s.id === id);
  assert.deepEqual(step('throughput', 'T4').needs, ['T3', 'host-adapters#H2']);
  assert.deepEqual(step('discovery-and-outcomes', 'D4').needs, ['D2', 'D3', 'work-coordination#K9', 'work-coordination#K10', 'work-coordination#K14']);
  assert.deepEqual(step('discovery-and-outcomes', 'D5').needs, ['D0', 'work-coordination#K8']);
  assert.deepEqual(step('discovery-and-outcomes', 'D6').needs, ['D0', 'work-coordination#K3']);
  for (const id of ['D4', 'D5']) assert.equal(step('discovery-and-outcomes', id).marker, ' ');
  const wc = plans.find((p) => p.stem === 'work-coordination');
  assert.deepEqual(wc.plans.map((p) => p.unit), ['work-coordination#A', 'work-coordination#B', 'work-coordination#C', 'work-coordination#D', 'work-coordination#E']);
  assert.equal(plans.find((p) => p.stem === 'discovery-and-outcomes').feature.claimable, true);
});
