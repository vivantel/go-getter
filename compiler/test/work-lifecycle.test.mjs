import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit, heartbeatUnit, ledgerView } from '../src/work/ops.mjs';
import { nextUnits } from '../src/work/next.mjs';
import { listAsks } from '../src/work/asks.mjs';
import { acceptBrief, cancelUnit, recordDenial, recordFailure, supersedeUnit, unitState } from '../src/work/lifecycle.mjs';
import { pushUnitCheckpoint, resumeInto } from '../src/work/recovery.mjs';

const MIN = 60_000;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const T0 = new Date('2026-11-04T09:00:00.000Z');
const at = (min) => new Date(T0.getTime() + min * MIN);
const who = (id, kind = 'agent') => ({ kind, id });

const PLAN = `# Feature
Owner-id: dana

## Phase
Id: P
Scope: src/**

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\`
Do: change the b module.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/c/** · Check: \`true\`
Do: change the c module.

### S4 Four — [ ]
Class: implement · Needs: none · Scope: src/d/** · Check: \`true\`
Do: change the d module.
`;

// A bare remote seeded with the plan, and clones of it that read short leases.
function world() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-lifecycle-')));
  const bare = path.join(base, 'remote.git');
  sh(base, 'init', '--bare', '-b', 'main', bare);
  const seed = path.join(base, 'seed');
  sh(base, 'init', '-b', 'main', seed);
  sh(seed, 'config', 'user.name', 'seed');
  sh(seed, 'config', 'user.email', 'seed@example.test');
  mkdirSync(path.join(seed, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(seed, 'docs/plans/feat.md'), PLAN);
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '-m', 'seed');
  sh(seed, 'remote', 'add', 'origin', bare);
  sh(seed, 'push', 'origin', 'main');
  const clone = (name) => {
    const dir = path.join(base, name);
    sh(base, 'clone', bare, dir);
    sh(dir, 'config', 'user.name', name);
    sh(dir, 'config', 'user.email', `${name}@example.test`);
    mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/decisions/0002-claim-settings.md'), '---\nid: 0002-claim-settings\ntitle: Claim settings\nstatus: active\ndate: 2026-11-04\ntags: [tracker]\ngo-getter:\n  lease-agent: "4"\n  lease-human: "4"\n  clock-skew: "30"\n  generated-by: orchestration@0.1.3\n---\n\n## Decision\n\nSettings.\n');
    return dir;
  };
  return { base, bare, clone };
}
const entry = (dir, unit, now = at(1)) => ledgerView(dir, 'feat', { now }).entries.find((e) => e.unit === unit);
const planPath = (dir) => path.join(dir, 'docs/plans/feat.md');

test('a lapsed lease is resumed from the pushed unit branch and checkpoint ref in a second clone', async () => {
  const w = world();
  const a = w.clone('a');
  const b = w.clone('b');
  assert.ok((await claimUnit(a, 'feat#S1', who('alice'), { now: T0 })).ok);
  sh(a, 'switch', '-c', 'feat/s1');
  mkdirSync(path.join(a, 'src/a'), { recursive: true });
  writeFileSync(path.join(a, 'src/a/x.mjs'), 'export const done = 1;\n');
  sh(a, 'add', 'src');
  sh(a, 'commit', '-m', 'work');
  sh(a, 'push', 'origin', 'feat/s1');
  writeFileSync(path.join(a, 'wip.txt'), 'not committed\n');
  const beat = await heartbeatUnit(a, 'feat#S1', who('alice'), { now: at(3) });
  assert.equal(beat.renewed, true);
  const pushedTip = sh(a, 'rev-parse', 'feat/s1');
  // alice is gone: her lease and the margin pass, and bob takes the unit, which is `ready` again
  assert.equal(unitState({ entry: entry(a, 'feat#S1', at(60)), live: false }), 'ready');
  const claim = await claimUnit(b, 'feat#S1', who('bob'), { now: at(60) });
  assert.ok(claim.ok, claim.error);
  assert.equal(claim.tookOver.id, 'alice');
  assert.equal(claim.recovered.branch.name, 'feat/s1');
  assert.equal(claim.recovered.branch.commit, pushedTip);
  assert.equal(sh(b, 'show', `${claim.recovered.checkpoint.commit}:wip.txt`), 'not committed');
  const resumed = resumeInto(b, 'origin', claim.recovered);
  assert.ok(resumed.ok, resumed.error);
  assert.equal(sh(b, 'rev-parse', 'HEAD'), pushedTip);
  assert.equal(readFileSync(path.join(b, 'wip.txt'), 'utf8'), 'not committed\n');
});

test('a checkpoint holding a secret is not pushed', () => {
  const w = world();
  const a = w.clone('a');
  writeFileSync(path.join(a, 'leak.txt'), `KEY=${['AKIA', 'IOSFODNN7EXAMPLE'].join('')}\n`);
  assert.deepEqual(pushUnitCheckpoint(a, 'origin', 'feat#S1'), { skipped: 'the working tree holds a secret' });
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/checkpoints'), '');
});

test('a unit passes through three claimants, then is quarantined into an ask to the parent owner', async () => {
  const w = world();
  const a = w.clone('a');
  const names = ['alice', 'bob', 'carol'];
  for (const [i, n] of names.entries()) {
    const c = await claimUnit(a, 'feat#S1', who(n), { now: at(i) });
    assert.ok(c.ok, c.error);
    assert.deepEqual(c.entry.counters, { failures: 0, claimants: i + 1 });
    const first = await recordFailure(a, 'feat#S1', who(n), { reason: 'check red', now: at(i) });
    assert.equal(first.outcome, 'recorded');
    const second = await recordFailure(a, 'feat#S1', who(n), { reason: 'check red', now: at(i) });
    assert.equal(second.outcome, i < 2 ? 'released' : 'quarantined', `claimant ${n}`);
  }
  const e = entry(a, 'feat#S1', at(3));
  assert.equal(e.state, 'parked');
  assert.equal(unitState({ entry: e, live: true }), 'quarantined');
  const asks = listAsks(a, { now: at(3) });
  const ask = asks.find((x) => x.unit === 'feat#S1');
  assert.ok(ask, 'an ask was raised');
  assert.equal(ask.status, 'open');
  assert.deepEqual(e.ask.route, ['dana'], "the parent's owner");
  assert.equal((await claimUnit(a, 'feat#S1', who('dave'), { now: at(4) })).ok, false);
  assert.ok(!nextUnits(a, { now: at(4) }).ready.some((u) => u.unit === 'feat#S1'), 'out of work next');
});

test('cancel cascades to unmerged descendants, closes their branches and leaves merged work', async () => {
  const w = world();
  const a = w.clone('a');
  const b = w.clone('b');
  assert.ok((await claimUnit(a, 'feat#P', who('lead'), { now: T0 })).ok);
  const child = await claimUnit(b, 'feat#S3', who('worker'), { now: at(1), issuer: who('lead') });
  assert.ok(child.ok, child.error);
  sh(b, 'switch', '-c', 'feat/s3');
  writeFileSync(path.join(b, 'c.txt'), 'wip\n');
  assert.ok(pushUnitCheckpoint(b, 'origin', 'feat#S3').ok);
  writeFileSync(planPath(a), readFileSync(planPath(a), 'utf8').replace('### S1 One — [ ]', '### S1 One — [x]')); // S1 is merged
  const closed = [];
  const r = await cancelUnit(a, 'feat#P', who('lead'), { now: at(2), closeBranch: async ({ branch }) => closed.push(branch) });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.left, ['feat#S1'], 'merged work stays');
  assert.deepEqual(r.refused, []);
  assert.ok(r.ended.includes('feat#P') && r.ended.includes('feat#S3') && r.ended.includes('feat#S2'));
  assert.deepEqual(closed, ['feat/s3']);
  for (const u of ['feat#P', 'feat#S3', 'feat#S2']) {
    const e = entry(a, u, at(3));
    assert.equal(e.state, 'released');
    assert.equal(e.exit, 'cancelled');
    assert.deepEqual(e.scope, []);
  }
  assert.equal(entry(a, 'feat#S1', at(3)), undefined, 'S1 was left untouched');
  assert.equal((await claimUnit(b, 'feat#S3', who('other'), { now: at(4) })).code, 'cancelled');
  assert.ok(!nextUnits(a, { now: at(4) }).ready.some((u) => ['feat#S2', 'feat#S3'].includes(u.unit)));
  assert.equal(unitState({ entry: entry(a, 'feat#S3', at(3)) }), 'cancelled');
});

test('a worker who is not the holder or issuer cannot cancel; the ledger ignores it and the cancel reports it refused', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S4', who('alice'), { now: T0 })).ok);
  const r = await cancelUnit(a, 'feat#S4', who('mallory'), { now: at(1) });
  assert.deepEqual(r.refused, ['feat#S4']);
  assert.equal(entry(a, 'feat#S4').state, 'claimed');
});

test('supersede releases the claim with a pointer to the successor and refuses later claims with it', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S3', who('alice'), { now: T0 })).ok);
  const r = await supersedeUnit(a, 'feat#S3', 'feat#S4', who('alice'), { now: at(1) });
  assert.ok(r.ok, r.error);
  assert.equal(r.successor, 'feat#S4');
  const e = entry(a, 'feat#S3', at(2));
  assert.equal(e.state, 'released');
  assert.equal(e.exit, 'superseded');
  assert.equal(e.successor, 'feat#S4');
  const again = await claimUnit(a, 'feat#S3', who('bob'), { now: at(3) });
  assert.equal(again.code, 'superseded');
  assert.equal(again.successor, 'feat#S4');
  assert.match(again.error, /feat#S4/);
  assert.equal((await supersedeUnit(a, 'feat#S3', 'feat#nope', who('alice'))).code, 'unknown-successor');
});

test('a brief change is flagged at the next heartbeat until the worker accepts it', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S1', who('alice'), { now: T0 })).ok);
  assert.equal((await heartbeatUnit(a, 'feat#S1', who('alice'), { now: at(1) })).briefChanged, undefined);
  writeFileSync(planPath(a), readFileSync(planPath(a), 'utf8').replace('change the a module.', 'change the a module and its docs.'));
  const flagged = await heartbeatUnit(a, 'feat#S1', who('alice'), { now: at(1) });
  assert.ok(flagged.ok);
  assert.ok(flagged.briefChanged, 'told at the next heartbeat');
  assert.notEqual(flagged.briefChanged.pinned, flagged.briefChanged.current);
  assert.match(flagged.briefChanged.action, /re-read|release/);
  assert.ok((await acceptBrief(a, 'feat#S1', who('alice'), { now: at(1) })).ok);
  assert.equal((await heartbeatUnit(a, 'feat#S1', who('alice'), { now: at(1) })).briefChanged, undefined);
});

test('the second denial by one guardrail parks the unit with the denial recorded; other guardrails count apart', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S2', who('alice'), { now: T0 })).ok);
  assert.equal((await recordDenial(a, 'feat#S2', who('alice'), 'restricted-paths-denied', { now: at(1) })).outcome, 'recorded');
  assert.equal((await recordDenial(a, 'feat#S2', who('alice'), 'no-secrets-in-added-lines', { now: at(1) })).outcome, 'recorded');
  const r = await recordDenial(a, 'feat#S2', who('alice'), 'restricted-paths-denied', { now: at(2) });
  assert.equal(r.outcome, 'parked');
  assert.equal(r.count, 2);
  const e = entry(a, 'feat#S2', at(2));
  assert.equal(e.state, 'parked');
  assert.equal(e.ask.denial, 'restricted-paths-denied');
  assert.equal(unitState({ entry: e, live: true }), 'parked');
  assert.equal((await recordDenial(a, 'feat#S2', who('alice'), 'Bad Id')).code, 'bad-guardrail');
});

test('unitState names each state of decision 0173', () => {
  assert.equal(unitState({ stepState: 'done' }), 'done');
  assert.equal(unitState({}), 'ready');
  assert.equal(unitState({ entry: { state: 'claimed' }, live: true }), 'claimed');
  assert.equal(unitState({ entry: { state: 'claimed', review: true }, live: true }), 'in-review');
  assert.equal(unitState({ entry: { state: 'released', blockedByHuman: true } }), 'blocked');
  assert.equal(unitState({ entry: { state: 'released', exit: 'superseded' } }), 'superseded');
  assert.equal(unitState({ stepState: 'draft' }), 'draft');
});

test('a unit whose third claimant lapsed is quarantined by the next claim, with an ask, and is not offered', async () => {
  const w = world();
  const a = w.clone('a');
  for (const [i, n] of ['alice', 'bob', 'carol'].entries()) assert.ok((await claimUnit(a, 'feat#S1', who(n), { now: at(i * 100) })).ok, n); // each lapses before the next
  assert.ok(!nextUnits(a, { now: at(250) }).ready.some((u) => u.unit === 'feat#S1'), 'not offered after the third claimant');
  const fourth = await claimUnit(a, 'feat#S1', who('dave'), { now: at(300) });
  assert.equal(fourth.code, 'quarantined');
  assert.ok(fourth.ask, 'an ask was raised');
  const e = entry(a, 'feat#S1', at(301));
  assert.equal(unitState({ entry: e, live: true }), 'quarantined');
  assert.deepEqual(e.ask.route, ['dana']);
});
