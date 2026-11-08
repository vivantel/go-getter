import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit, ledgerView, readEntries } from '../src/work/ops.mjs';
import { nextUnits } from '../src/work/next.mjs';
import { readRecord } from '../src/work/ledger.mjs';
import { ASKS_LOG, answerAsk, listAsks, parkAsk, readAskFile, resumeClaim, sweepAsks } from '../src/work/asks.mjs';

const cli = path.resolve(import.meta.dirname, '..', 'bin', 'go-getter.mjs');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const DAY = 86_400_000;
const AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join(''); // a well-known fake key

const PLAN = `# Feature
Owner-id: dana

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Owner-id: erin · Check: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: S1 · Scope: src/b/** · Check: \`true\`
Do: change the b module.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/a/x.mjs · Check: \`true\`
Do: inside a.

### S4 Four — [ ]
Class: implement · Needs: none · Scope: src/c/** · Owner-id: erin · Check: \`true\`
Do: the c module.
`;

const agent = { kind: 'agent', id: 'w-a' };
const other = { kind: 'agent', id: 'w-b' };
const human = (id) => ({ kind: 'human', id });
const ask = (over = {}) => ({ what: 'Drop the legacy export or keep it for one release', default: 'keep it for one release', evidence: 'two callers in src/a', class: 'reversible', ...over });

function repo() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-asks-')));
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 't');
  sh(dir, 'config', 'user.email', 't@example.com');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'src/a'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/feat.md'), PLAN);
  writeFileSync(path.join(dir, '.gitignore'), '.go-getter/\n');
  writeFileSync(path.join(dir, 'src/a/x.mjs'), 'export {};\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const states = (dir, now) => ledgerView(dir, 'feat', { now }).annotated.states;

test('parking frees the worker, keeps a claim that never expires, and lets an overlapping unit be claimed', async () => {
  const dir = repo();
  assert.ok((await claimUnit(dir, 'feat#S1', agent, { remote: null })).ok);
  assert.equal((await claimUnit(dir, 'feat#S3', other, { remote: null })).code, 'queued', 'S3 overlaps the live S1');
  const p = await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  assert.ok(p.ok, p.error);
  assert.equal(p.entry.state, 'parked');
  assert.deepEqual(p.entry.scope, []);
  assert.equal(Object.keys(readRecord(dir).claims ?? {}).includes('feat#S1'), false, 'the worker no longer holds or renews it');
  const later = new Date(Date.now() + 400 * DAY);
  assert.equal(states(dir, later).get('feat#S1').live, true, 'the parked claim never lapses');
  assert.equal(states(dir, later).get('feat#S1').parked, true);
  assert.ok((await claimUnit(dir, 'feat#S3', other, { remote: null })).ok, 'the overlapping unit proceeds');
  assert.equal(nextUnits(dir, { now: later }).ready.some((r) => r.unit === 'feat#S1'), false, 'a parked unit is not offered');
});

test('an answer returns the unit to ready; claiming it re-acquires its scope, queued while another unit holds it', async () => {
  const dir = repo();
  sh(dir, 'checkout', '-q', '-b', 'feat/s1');
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  writeFileSync(path.join(dir, 'src/a/mine.mjs'), 'export const mine = 1;\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'work in progress');
  assert.ok((await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null })).ok);
  sh(dir, 'checkout', '-q', 'main');
  writeFileSync(path.join(dir, 'moved.txt'), 'main moved on\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'main moves');
  assert.ok((await claimUnit(dir, 'feat#S3', other, { remote: null })).ok, 'S3 takes the scope meanwhile');
  const a = await answerAsk(dir, 'feat#S1', 'default', human('erin'), { remote: null });
  assert.ok(a.ok, a.error);
  assert.equal(states(dir).get('feat#S1').live, false, 'answered: the claim is released');
  assert.equal(nextUnits(dir, {}).ready.some((r) => r.unit === 'feat#S1'), false, 'S3 holds the scope now, so S1 is queued, not ready');
  assert.equal(nextUnits(dir, {}).queued.find((q) => q.unit === 'feat#S1').behind, 'feat#S3');
  const queued = await resumeClaim(dir, 'feat#S1', other, { remote: null });
  assert.equal(queued.code, 'queued');
  const { releaseUnit } = await import('../src/work/ops.mjs');
  assert.ok((await releaseUnit(dir, 'feat#S3', other, { remote: null })).ok);
  assert.equal(nextUnits(dir, {}).ready.some((r) => r.unit === 'feat#S1'), true, 'ready once the scope is free');
});

test('the branch is rebased onto the default branch when work resumes', async () => {
  const dir = repo();
  sh(dir, 'checkout', '-q', '-b', 'feat/s1');
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  writeFileSync(path.join(dir, 'src/a/mine.mjs'), 'export const mine = 1;\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'wip');
  await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  sh(dir, 'checkout', '-q', 'main');
  writeFileSync(path.join(dir, 'moved.txt'), 'x\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'main moves');
  assert.throws(() => sh(dir, 'merge-base', '--is-ancestor', 'main', 'feat/s1'), 'the branch is behind main');
  await answerAsk(dir, 'feat#S1', 'refuse', human('erin'), { remote: null });
  const r = await resumeClaim(dir, 'feat#S1', other, { remote: null });
  assert.ok(r.ok, r.error);
  assert.equal(r.rebase.ok, true, r.rebase.note);
  assert.doesNotThrow(() => sh(dir, 'merge-base', '--is-ancestor', 'main', 'feat/s1'));
  assert.ok(existsSync(path.join(dir, 'src/a/mine.mjs')) || sh(dir, 'show', 'feat/s1:src/a/mine.mjs'), 'its own work survives the rebase');
});

test('an ask is routed by the unit\'s owner chain, then by declared path owners', async () => {
  const dir = repo();
  mkdirSync(path.join(dir, '.github'), { recursive: true });
  writeFileSync(path.join(dir, '.github/CODEOWNERS'), '# owners\n/src/a/ @carol @dana\n/src/b/ @bob\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'owners');
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const p = await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  assert.deepEqual(p.ask.route, ['erin', 'dana', 'carol'], 'the unit, its feature, then the owners of src/a');
  await claimUnit(dir, 'feat#S3', other, { remote: null });
  const q = await parkAsk(dir, 'feat#S3', other, ask(), { remote: null });
  assert.deepEqual(q.ask.route, ['dana', 'carol'], 'S3 has no Owner-id of its own, so it takes the feature\'s');
  const mine = (id) => listAsks(dir, { who: human(id), mine: true }).map((a) => a.unit);
  assert.deepEqual(mine('erin'), ['feat#S1']);
  assert.deepEqual(mine('dana'), ['feat#S3'], 'S1 has not reached dana yet');
  assert.deepEqual(mine('carol'), [], 'carol is on the route but the ask has not reached her');
  assert.deepEqual(listAsks(dir, { who: human('zed') }).length, 2, 'unfiltered lists every open ask');
});

test('an answer is recorded under the answerer, releases the unit, and only a human on the route may give it', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  assert.equal((await answerAsk(dir, 'feat#S1', 'default', agent, { remote: null })).code, 'not-human');
  const off = await answerAsk(dir, 'feat#S1', 'default', human('mallory'), { remote: null });
  assert.equal(off.code, 'not-on-route');
  const secret = await answerAsk(dir, 'feat#S1', `use key ${AWS}`, human('erin'), { remote: null });
  assert.equal(secret.ok, false);
  const ok = await answerAsk(dir, 'feat#S1', 'default', human('erin'), { remote: null });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.entry.state, 'released');
  assert.deepEqual({ by: ok.entry.answer.by, kind: ok.entry.answer.kind, choice: ok.entry.answer.choice }, { by: 'erin', kind: 'human', choice: 'default' });
  assert.equal(listAsks(dir, {}).length, 0);
  assert.equal(nextUnits(dir, {}).ready.some((r) => r.unit === 'feat#S1'), true, 'ready again');
  assert.ok((await resumeClaim(dir, 'feat#S1', other, { remote: null })).ok, 'any eligible worker may claim it');
});

test('a forged answer by a non-answerer is ignored by readers', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const p = await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  const { commitEntries, ledgerRef } = await import('../src/work/ledger.mjs');
  const tip = sh(dir, 'rev-parse', ledgerRef('feat'));
  const forged = { ...p.entry, state: 'released', updated: new Date().toISOString(), answer: { by: 'someone-else', kind: 'human', choice: 'default', at: new Date().toISOString() } };
  const c = commitEntries(dir, tip, { 'S1.json': forged }, { author: 'mallory', message: 'forge', now: new Date() });
  sh(dir, 'update-ref', ledgerRef('feat'), c);
  const { entries, ignored } = readEntries(dir, c, {});
  assert.equal(entries.find((e) => e.unit === 'feat#S1').state, 'parked');
  assert.equal(ignored.length >= 1, true);
});

test('a reversible ask takes the default after the timeout and writes a draft decision', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  await parkAsk(dir, 'feat#S1', agent, ask(), { remote: null });
  assert.deepEqual(await sweepAsks(dir, human('erin'), { remote: null }), [], 'not before the timeout');
  const done = await sweepAsks(dir, other, { remote: null, now: new Date(Date.now() + 25 * 3600_000) });
  assert.equal(done.length, 1);
  assert.equal(done[0].outcome, 'default');
  const draft = readFileSync(path.join(dir, done[0].draft), 'utf8');
  assert.match(draft, /^status: draft$/m);
  assert.match(draft, /keep it for one release/);
  assert.match(done[0].draft, /docs\/decisions\/draft-/);
  assert.equal(states(dir).get('feat#S1').live, false, 'the unit is released and ready');
  const e = states(dir).get('feat#S1').entry;
  assert.equal(e.answer.by, 'timeout');
  assert.equal(nextUnits(dir, { now: new Date(Date.now() + 26 * 3600_000) }).ready.some((r) => r.unit === 'feat#S1'), true);
});

test('an irreversible ask escalates up the route, never takes the default, and ends blocked-by-human', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  await parkAsk(dir, 'feat#S1', agent, ask({ class: 'irreversible' }), { remote: null });
  const hours = (n) => new Date(Date.now() + n * 3600_000);
  assert.equal((await sweepAsks(dir, other, { remote: null, now: hours(25) }))[0].outcome, 'escalated');
  assert.equal(listAsks(dir, {})[0].owner, 'dana', 'now at the feature owner');
  assert.deepEqual(listAsks(dir, { who: human('erin'), mine: true }).length, 1, 'the first owner still sees it');
  assert.deepEqual(await sweepAsks(dir, other, { remote: null, now: hours(26) }), [], 'the new deadline has not passed');
  assert.equal(states(dir).get('feat#S1').live, true, 'still parked, never proceeding');
  const last = await sweepAsks(dir, other, { remote: null, now: hours(50) });
  assert.equal(last[0].outcome, 'blocked-by-human');
  assert.equal(last[0].draft, undefined, 'no default is taken');
  assert.equal(states(dir).get('feat#S1').live, false);
  assert.equal(nextUnits(dir, {}).skipped.find((s) => s.unit === 'feat#S1').reason, 'blocked-by-human');
  assert.equal((await claimUnit(dir, 'feat#S1', other, { remote: null })).code, 'blocked-by-human');
  assert.equal(listAsks(dir, {})[0].status, 'blocked-by-human');
  const a = await answerAsk(dir, 'feat#S1', 'refuse', human('dana'), { remote: null });
  assert.ok(a.ok, a.error);
  assert.ok((await claimUnit(dir, 'feat#S1', other, { remote: null })).ok, 'a human answer unblocks it');
});

test('an ask with a security impact is irreversible even when marked reversible', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  await parkAsk(dir, 'feat#S1', agent, ask({ impact: 'security' }), { remote: null });
  const r = await sweepAsks(dir, other, { remote: null, now: new Date(Date.now() + 25 * 3600_000) });
  assert.equal(r[0].outcome, 'escalated');
});

test('a reader ignores a default taken early or on an irreversible ask', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const p = await parkAsk(dir, 'feat#S1', agent, ask({ class: 'irreversible' }), { remote: null });
  const { commitEntries, ledgerRef } = await import('../src/work/ledger.mjs');
  const forged = { ...p.entry, state: 'released', updated: new Date(Date.now() + 30 * 3600_000).toISOString(), answer: { by: 'timeout', kind: 'ci', choice: 'default', at: 'x' } };
  const c = commitEntries(dir, sh(dir, 'rev-parse', ledgerRef('feat')), { 'S1.json': forged }, { author: 'w-b', message: 'forge', now: new Date() });
  assert.equal(readEntries(dir, c, {}).entries.find((e) => e.unit === 'feat#S1').state, 'parked');
});

test('the log holds class, wait and outcome and never the ask text', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  await parkAsk(dir, 'feat#S1', agent, ask({ what: 'UNIQUE-WHAT-TEXT', default: 'UNIQUE-DEFAULT-TEXT', evidence: 'UNIQUE-EVIDENCE-TEXT' }), { remote: null });
  await sweepAsks(dir, other, { remote: null, now: new Date(Date.now() + 25 * 3600_000) });
  const log = readFileSync(path.join(dir, ASKS_LOG), 'utf8');
  const recs = log.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(recs.map((r) => r.event), ['parked', 'timeout']);
  assert.equal(recs[1].class, 'reversible');
  assert.equal(recs[1].outcome, 'default');
  assert.ok(recs[1].waitMs > 24 * 3600_000);
  assert.doesNotMatch(log, /UNIQUE/);
});

test('an ask holding a secret, or missing a field, is refused', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const bad = await parkAsk(dir, 'feat#S1', agent, ask({ evidence: `key ${AWS}` }), { remote: null });
  assert.equal(bad.code, 'sensitive');
  const file = path.join(dir, 'ask.json');
  writeFileSync(file, JSON.stringify({ what: 'x', default: 'y', class: 'reversible' }));
  assert.match(readAskFile(file).error, /evidence/);
  writeFileSync(file, JSON.stringify({ what: 'x', default: 'y', evidence: 'z', class: 'maybe' }));
  assert.match(readAskFile(file).error, /class/);
});

test('the verbs park, list and answer from the command line', () => {
  const dir = repo();
  const env = { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: 'w-a' };
  const run = (...args) => spawnSync(process.execPath, [cli, 'work', ...args], { cwd: dir, encoding: 'utf8', env });
  assert.equal(run('claim', 'feat#S1').status, 0);
  writeFileSync(path.join(dir, 'ask.json'), JSON.stringify(ask()));
  const parked = run('park', 'feat#S1', '--ask', 'ask.json');
  assert.equal(parked.status, 0, parked.stderr);
  assert.match(parked.stdout, /parked on ask a-[0-9a-f]{8}/);
  const listed = run('asks', '--as', 'erin', '--kind', 'human', '--mine');
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /feat#S1/);
  assert.match(listed.stdout, /default: keep it for one release/);
  assert.equal(run('answer', 'feat#S1', 'default', '--as', 'erin').status, 1, 'an agent cannot answer');
  const answered = run('answer', 'feat#S1', 'default', '--as', 'erin', '--kind', 'human');
  assert.equal(answered.status, 0, answered.stderr);
  assert.match(run('asks').stdout, /no open ask/);
  assert.equal(run('park', 'feat#S1').status, 2);
});
