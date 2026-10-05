import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parsePlan, readPlan, planFiles, nextSteps, planStatus } from '../src/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

const FIXTURE = `# Fixture plan

**Status legend**: prose that names \`Class:\` is not a step.

## Phase 1

### 1.1 Done first — [x]
Class: explore · Needs: none · Check: \`true\`
Done-when: it is done.

### 1.2 Parallel one — [ ] ‖
Class: review · Effort: high · Needs: 1.1
Do: something.
Done-when: one is reviewed.

### 1.2a Parallel two ‖ — [ ]
Needs: 1.1
Done-when: two is built.

### 1.3 Blocked by a pending step — [ ]
Needs: 1.2
Done-when: never offered yet.

### 1.4 In progress — [~]
Done-when: not offered.

### 1.5 Moved — [>]

### 1.6 Ready, no fields — [ ]

### 1.7 Ready, debug — [ ]
Class: debug · Tier: small · Data: confidential · Needs: none
Done-when: seven.

### 1.8 Fifth ready step — [ ]
Done-when: not shown, the list stops at four.

---

## Backlog

- **L.1 not a step** — prose.
`;

test('parses step ids, markers, fields and defaults', () => {
  const plan = parsePlan(FIXTURE, 'fixture.md');
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.steps.map((s) => `${s.id}[${s.marker}]`), ['1.1[x]', '1.2[ ]', '1.2a[ ]', '1.3[ ]', '1.4[~]', '1.5[>]', '1.6[ ]', '1.7[ ]', '1.8[ ]']);
  const [s11, s12, s12a] = plan.steps;
  assert.equal(s11.check, 'true');
  assert.deepEqual(s11.needs, []);
  assert.equal(s12.effort, 'high');
  assert.equal(s12.fields.Do, 'something.');
  assert.equal(s12a.title, 'Parallel two');
  assert.equal(s12a.class, 'implement');
  assert.ok(s12.parallel && s12a.parallel);
  assert.deepEqual(planStatus(plan).counts, { pending: 6, 'in progress': 1, done: 1, blocked: 0, moved: 1 });
});

test('next offers at most four ready pending steps as numbered options', () => {
  assert.deepEqual(nextSteps(parsePlan(FIXTURE, 'fixture.md')), [
    { option: 1, id: '1.2', title: 'Parallel one', class: 'review', parallel: true, doneWhen: 'one is reviewed.' },
    { option: 2, id: '1.2a', title: 'Parallel two', class: 'implement', parallel: true, doneWhen: 'two is built.' },
    { option: 3, id: '1.6', title: 'Ready, no fields', class: 'implement', parallel: false, doneWhen: null },
    { option: 4, id: '1.7', title: 'Ready, debug', class: 'debug', parallel: false, doneWhen: 'seven.' },
  ]);
});

test('a lone parallel option is not marked parallel', () => {
  const plan = parsePlan('### 1 One — [ ] ‖\n\n### 2 Two — [ ]\nNeeds: 1\n', 'p.md');
  assert.equal(nextSteps(plan)[0].parallel, false);
});

test('rejects unknown field values, unknown Needs ids, cycles and malformed headings', () => {
  const bad = [
    '### 1 One — [ ]',
    'Class: build · Tier: huge · Effort: max · Data: secret · Owner: me',
    '### 2 Two — [ ]',
    'Needs: 3, 9',
    '### 3 Three — [ ]',
    'Needs: 2',
    '### 4 Four — [?]',
    '### 5 No marker',
    '### 2 Again — [x]',
  ].join('\n');
  const problems = parsePlan(bad, 'bad.md').problems.join('\n');
  for (const want of [
    /unknown Class "build"/,
    /unknown Tier "huge"/,
    /unknown Effort "max"/,
    /unknown Data "secret"/,
    /unknown field "Owner: me"/,
    /step 2 needs unknown step 9/,
    /dependency cycle 2 -> 3 -> 2/,
    /step 4 has unknown marker \[\?\]/,
    /bad.md:8: heading is not a step/,
    /step id 2 is used twice/,
  ])
    assert.match(problems, want);
});

test("this repo's plans parse, including the archived plan", () => {
  const files = planFiles(root);
  assert.ok(files.includes(path.join('docs', 'plans', 'archive', 'bootstrap-go-getter.md')));
  for (const f of files) assert.deepEqual(readPlan(path.join(root, f)).problems, [], f);
  const archived = readPlan(path.join(root, 'docs/plans/archive/bootstrap-go-getter.md'));
  const moved = archived.steps.find((s) => s.id === '6.2a');
  assert.equal(moved.class, 'implement');
  assert.ok(archived.steps.some((s) => s.marker === '>'));
  const current = readPlan(path.join(root, 'docs/plans/v0.2-agent-core-hardening.md'));
  const a2 = current.steps.find((s) => s.id === 'A.2');
  assert.deepEqual([a2.class, a2.effort, a2.needs, a2.check], ['implement', 'high', ['0.5'], 'npm test']);
});

test('CLI: plan next and check plans on a fixture project', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'docs/plans/archive'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/fixture.md'), FIXTURE);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });

  const next = run('plan', 'next');
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /^1\. 1\.2 Parallel one \(review\) ‖\n {3}Done-when: one is reviewed\.\n2\. 1\.2a /);
  assert.match(next.stdout, /4\. 1\.7 Ready, debug \(debug\)\n/);
  assert.doesNotMatch(next.stdout, /1\.8/);
  assert.equal(JSON.parse(run('plan', 'next', '--json').stdout).length, 4);
  assert.match(run('plan', 'status').stdout, /1\/9 done, 1 in progress, 0 blocked, 1 moved, 6 pending/);
  assert.equal(run('check', 'plans').status, 0);

  writeFileSync(path.join(dir, 'docs/plans/archive/old.md'), '### 1 One — [x]\nNeeds: 2\n');
  const check = run('check', 'plans');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /archive\/old\.md:1: step 1 needs unknown step 2/);
  assert.equal(run('plan', 'next').status, 0); // archived plans are not candidates for the default plan
  writeFileSync(path.join(dir, 'docs/plans/second.md'), '### 1 One — [ ]\n');
  assert.match(run('plan', 'next').stderr, /several plans in docs\/plans; name one/);
  assert.match(run('plan', 'next', 'docs/plans/second.md').stdout, /^1\. 1 One \(implement\)$/m);
  assert.equal(run('plan', 'bogus').status, 2);
});
