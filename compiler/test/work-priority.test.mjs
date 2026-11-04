import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit } from '../src/work/ops.mjs';
import { nextUnits } from '../src/work/next.mjs';
import { approveUnit } from '../src/work/intake.mjs';
import { flowConfig, pickAmong } from '../src/work/priority.mjs';
import { tokenCovers, uncovered } from '../src/work/scope.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const repo = (files) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-wprio-')));
  sh(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, 'docs/plans', `${name}.md`), text);
  return dir;
};
const ids = (list) => list.map((x) => x.unit.split('#')[1]);
const agent = (id) => ({ kind: 'agent', id });
const FLOW = { pickAmong: 1, wipPerWorker: 3, wipPerFeature: null };
const step = (id, extra = '', body = '') => `### ${id} Step ${id} — [ ]\nClass: implement · Needs: none · Scope: src/${id.toLowerCase()}/** · Check: \`true\`${extra}\n${body}\n`;

test('a step inherits the priority of its plan, and its own wins', () => {
  const dir = repo({
    feat: `# Feature\nOwner-id: dana\n\n## Low\nId: LO\nPriority: 1\n\n${step('A')}\n## High\nId: HI\nPriority: 5\n\n${step('B')}${step('C', ' · Priority: 9')}${step('D')}`,
  });
  assert.deepEqual(ids(nextUnits(dir, { flow: FLOW }).ready), ['C', 'B', 'D', 'A']);
});

test('the same priority is ordered by the longest chain of units waiting behind, then by plan order', () => {
  const dir = repo({
    feat: `# Feature\n\n${step('W')}${step('X')}${step('Y', '').replace('Needs: none', 'Needs: X')}${step('Z').replace('Needs: none', 'Needs: Y')}`,
  });
  assert.deepEqual(ids(nextUnits(dir, { flow: FLOW }).ready), ['X', 'W']);
});

test('a worker at its limit is offered nothing, another worker is', async () => {
  const dir = repo({ feat: `# Feature\n\n${step('A')}${step('B')}${step('C')}` });
  const flow = { ...FLOW, wipPerWorker: 1 };
  assert.ok((await claimUnit(dir, 'feat#A', agent('w-a'), { remote: null })).ok);
  const full = nextUnits(dir, { worker: agent('w-a'), flow });
  assert.deepEqual(full.ready, []);
  assert.match(full.skipped.find((s) => s.unit === 'feat#B').reason, /worker limit: w-a holds 1 of 1/);
  assert.deepEqual(ids(nextUnits(dir, { worker: agent('w-b'), flow }).ready), ['B', 'C']);
});

test('a feature at its limit offers nothing of that feature while others are still offered', async () => {
  const dir = repo({ one: `# One\n\n${step('A')}${step('B')}`, two: `# Two\n\n${step('C')}` });
  const flow = { ...FLOW, wipPerFeature: 1 };
  assert.ok((await claimUnit(dir, 'one#A', agent('w-a'), { remote: null })).ok);
  const r = nextUnits(dir, { worker: agent('w-b'), flow });
  assert.deepEqual(ids(r.ready), ['C']);
  assert.match(r.skipped.find((s) => s.unit === 'one#B').reason, /feature limit: one has 1 live claims/);
});

test('workers with different ids pick among the first k, the same worker picks the same unit', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];
  const firsts = new Set(Array.from({ length: 30 }, (_, i) => pickAmong(list, `w-${i}`, 3)[0]));
  assert.deepEqual([...firsts].sort(), ['a', 'b', 'c']);
  assert.equal(pickAmong(list, 'w-1', 3)[0], pickAmong(list, 'w-1', 3)[0]);
  assert.equal(pickAmong(list, 'w-9', 1)[0], 'a');
  assert.equal(pickAmong(list, 'w-9', 3).length, 5);
});

test('pack answers set k and the limits; the worker limit defaults to max-concurrent', () => {
  assert.deepEqual(flowConfig({}), { pickAmong: 5, wipPerWorker: 3, wipPerFeature: null });
  assert.deepEqual(flowConfig({ 'max-concurrent': '10', 'pick-among': '2', 'wip-per-worker': 'max-concurrent', 'wip-per-feature': '4' }), { pickAmong: 2, wipPerWorker: 10, wipPerFeature: 4 });
  assert.equal(flowConfig({ 'max-concurrent': '10', 'wip-per-worker': '2' }).wipPerWorker, 2);
});

test('scope containment: a path or glob inside a glob is covered, a wider one is not', () => {
  assert.ok(tokenCovers('src/**', 'src/a/b.mjs'));
  assert.ok(tokenCovers('src/**', 'src/a/**'));
  assert.ok(tokenCovers('src/a', 'src/a/b.mjs'));
  assert.ok(!tokenCovers('src/a/**', 'src/**'));
  assert.ok(!tokenCovers('src/a', 'src/b'));
  assert.ok(tokenCovers('tag:x', 'tag:x') && !tokenCovers('src/**', 'tag:x'));
  assert.equal(uncovered(['src/**'], ['src/a/**', 'lib/x']), 'lib/x');
});

const PARENT = '# Feature\nOwner-id: dana\n\n## Phase\nId: P1\nScope: src/**\nAccept: `true`\n\n';
const draft = (id, scope, extra = '') => `### ${id} Child ${id} — [ ]\nClass: implement · Needs: none${scope === null ? '' : ` · Scope: ${scope}`} · Check: \`true\`\nIntake: draft\n${extra}\n`;

test('a draft unit is not offered until approved', async () => {
  const dir = repo({ feat: PARENT + draft('C1', 'src/a/**') });
  const r = nextUnits(dir, { flow: FLOW });
  assert.deepEqual(ids(r.ready), []);
  assert.match(r.skipped.find((s) => s.unit === 'feat#C1').reason, /not approved/);
});

test('a unit without a scope, or without Accept where it is required, is refused at approval', async () => {
  const dir = repo({
    feat: `${PARENT}${draft('C1', null)}${draft('C2', 'src/b/**')}${draft('C3', 'src/c/**', 'Parent: feat#C2\n')}`,
  });
  assert.ok((await claimUnit(dir, 'feat#P1', agent('w-a'), { remote: null })).ok);
  const noScope = await approveUnit(dir, 'feat#C1', agent('w-a'));
  assert.equal(noScope.ok, false);
  assert.match(noScope.error, /declares no Scope/);
  const noAccept = await approveUnit(dir, 'feat#C2', agent('w-a'));
  assert.equal(noAccept.ok, false);
  assert.match(noAccept.error, /declares no Accept/);
});

test('a child is approved by the parent holder within its grant and is then offered', async () => {
  const dir = repo({ feat: PARENT + draft('C1', 'src/a/**') });
  assert.ok((await claimUnit(dir, 'feat#P1', agent('w-a'), { remote: null })).ok);
  const r = await approveUnit(dir, 'feat#C1', agent('w-a'));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.by, 'parent-holder');
  assert.deepEqual(ids(nextUnits(dir, { worker: agent('w-b'), flow: FLOW }).ready), ['C1']);
});

test('only the parent holder approves, and changing the brief after approval makes the unit a draft again', async () => {
  const dir = repo({ feat: PARENT + draft('C1', 'src/a/**') });
  assert.ok((await claimUnit(dir, 'feat#P1', agent('w-a'), { remote: null })).ok);
  const other = await approveUnit(dir, 'feat#C1', agent('w-b'));
  assert.equal(other.code, 'ask');
  assert.ok((await approveUnit(dir, 'feat#C1', agent('w-a'))).ok);
  writeFileSync(path.join(dir, 'docs/plans/feat.md'), PARENT + draft('C1', 'src/a/**', 'Do: now also change something else.\n'));
  assert.deepEqual(ids(nextUnits(dir, { flow: FLOW }).ready), []);
});

test('a unit above the holder grant asks the Owner-id, who may approve it', async () => {
  const dir = repo({ feat: PARENT + draft('C1', 'lib/**') });
  assert.ok((await claimUnit(dir, 'feat#P1', agent('w-a'), { remote: null })).ok);
  const r = await approveUnit(dir, 'feat#C1', agent('w-a'));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ask');
  assert.equal(r.ask.to, 'dana');
  assert.match(r.ask.reason, /lib\/\*\* exceeds the grant/);
  assert.deepEqual(ids(nextUnits(dir, { flow: FLOW }).ready), []);
  const owner = await approveUnit(dir, 'feat#C1', { kind: 'human', id: 'dana' });
  assert.equal(owner.by, 'owner-id');
  assert.deepEqual(ids(nextUnits(dir, { flow: FLOW }).ready), ['C1']);
});

test('a parent with no live holder asks the Owner-id', async () => {
  const dir = repo({ feat: PARENT + draft('C1', 'src/a/**') });
  const r = await approveUnit(dir, 'feat#C1', agent('w-a'));
  assert.equal(r.code, 'ask');
  assert.match(r.ask.reason, /no live holder/);
  assert.equal(r.ask.to, 'dana');
});

test('a rule-generated unit is ready with no human, and refused when it exceeds the parent grant', async () => {
  const dir = repo({ feat: PARENT + draft('R1', 'src/meter/**', 'Rule: reading\n') + draft('R2', 'docs/**', 'Rule: reading\n') });
  const r = nextUnits(dir, { flow: FLOW });
  assert.deepEqual(ids(r.ready), ['R1']);
  assert.match(r.skipped.find((s) => s.unit === 'feat#R2').reason, /docs\/\*\* exceeds its parent's grant/);
  const ok = await approveUnit(dir, 'feat#R1', agent('w-a'));
  assert.deepEqual([ok.ok, ok.by], [true, 'rule reading']);
  const bad = await approveUnit(dir, 'feat#R2', agent('w-a'));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /exceeds its parent's grant/);
});

test('go-getter work approve prints the ask and exits 3 when the Owner-id must answer', () => {
  const dir = repo({ feat: PARENT + draft('C1', 'src/a/**') });
  const cli = path.join(path.resolve(import.meta.dirname, '..'), 'bin/go-getter.mjs');
  const run = (...a) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [cli, 'work', 'approve', ...a], { cwd: dir, encoding: 'utf8', env: { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: 'w-t' } }) };
    } catch (e) {
      return { code: e.status, out: e.stdout + e.stderr };
    }
  };
  const ask = run('feat#C1');
  assert.equal(ask.code, 3);
  assert.match(ask.out, /needs the approval of dana/);
  const done = run('feat#C1', '--as', 'dana', '--kind', 'human');
  assert.equal(done.code, 0, done.out);
  assert.match(done.out, /approved by owner-id/);
});
