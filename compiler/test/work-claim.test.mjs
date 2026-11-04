import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, realpathSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit, heartbeatUnit, releaseUnit, ledgerView, readEntries, identity, renewAll, hostDateFor, remoteHost } from '../src/work/ops.mjs';
import { annotate, conflict, makeEntry, validEntry, briefVersion, lastValidBeat } from '../src/work/claim.mjs';
import { commitEntries, fetchLedger, pushRef, ledgerRef, readBeats, heartbeatRef, pushHeartbeat, readRecord, updateRecord, beatTimes } from '../src/work/ledger.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(repoRoot, 'compiler/bin/go-getter.mjs');
const MIN = 60_000;

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tmp = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-claim-')));

const PLAN = `# Feature
Owner-id: dana

## Phase
Id: P
Scope: src/**

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Issue: acme/widgets#5
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/a/x.mjs · Check: \`true\`
Do: change one file of a.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\`
Do: change the b module.

### S4 Four — [ ]
Class: implement · Needs: none · Scope: interface:api, tag:billing · Check: \`true\`
Do: change the api.

### S5 Five — [ ]
Class: implement · Needs: none · Scope: tag:billing · Check: \`true\`
Do: change billing.

`;

// A bare remote seeded with the plan, and clones of it.
function world({ remote = true } = {}) {
  const base = tmp();
  const bare = path.join(base, 'remote.git');
  sh(base, 'init', '--bare', '-b', 'main', bare);
  sh(bare, 'config', 'core.logAllRefUpdates', 'always');
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
    if (remote) sh(base, 'clone', bare, dir);
    else {
      sh(base, 'clone', bare, dir);
      sh(dir, 'remote', 'remove', 'origin');
    }
    sh(dir, 'config', 'user.name', name);
    sh(dir, 'config', 'user.email', `${name}@example.test`);
    return dir;
  };
  return { base, bare, seed, clone };
}

// Pack answers as an adopted orchestration decision in a clone (short leases and a wide margin, so a test can move the clock
// without leaving the host's margin).
function settings(dir, data) {
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  const lines = Object.entries(data).map(([k, v]) => `  ${k}: "${v}"`).join('\n');
  writeFileSync(path.join(dir, 'docs/decisions/0002-claim-settings.md'), `---\nid: 0002-claim-settings\ntitle: Claim settings\nstatus: active\ndate: 2026-11-04\ntags: [tracker]\ngo-getter:\n${lines}\n  generated-by: orchestration@0.1.3\n---\n\n## Decision\n\nSettings.\n`);
}
const SHORT = { 'lease-agent': 4, 'lease-human': 4, 'clock-skew': 30 };

const who = (id, kind = 'agent') => ({ kind, id });
const T0 = new Date('2026-11-04T09:00:00.000Z');
const at = (min) => new Date(T0.getTime() + min * MIN);

function runCli(cwd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...cleanGitEnv(process.env), CI: '', ...(env.GO_GETTER_CLOCK_OFFSET_MS ? { GO_GETTER_TEST_MODE: '1' } : {}), ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// Every update of `ref` in the bare remote's reflog, as [old, new].
const updates = (bare, ref) => {
  const file = path.join(bare, 'logs', ref);
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(0, 2)) : [];
};
const isAncestor = (bare, a, b) => {
  try {
    sh(bare, 'merge-base', '--is-ancestor', a, b);
    return true;
  } catch {
    return false;
  }
};

test('two concurrent claimants (separate processes, clocks apart): exactly one wins a unit and the loser is queued', async () => {
  const w = world();
  const dirs = ['a', 'b', 'c', 'd'].map(w.clone);
  const jobs = [
    runCli(dirs[0], ['work', 'claim', 'feat#S1', '--as', 'alice'], { GO_GETTER_CLOCK_OFFSET_MS: String(0) }),
    runCli(dirs[1], ['work', 'claim', 'feat#S1', '--as', 'bob'], { GO_GETTER_CLOCK_OFFSET_MS: String(4 * MIN) }),
    runCli(dirs[2], ['work', 'claim', 'feat#S2', '--as', 'carol'], { GO_GETTER_CLOCK_OFFSET_MS: String(-4 * MIN) }), // overlaps S1
    runCli(dirs[3], ['work', 'claim', 'feat#S3', '--as', 'dave']), // disjoint
  ];
  const results = await Promise.all(jobs);
  const won = results.map((r, i) => (r.code === 0 ? ['alice', 'bob', 'carol', 'dave'][i] : null)).filter(Boolean);
  assert.equal(won.filter((n) => n !== 'dave').length, 1, `one of the three overlapping claimants wins: ${JSON.stringify(results.map((r) => [r.code, r.stderr.trim()]))}`);
  assert.ok(won.includes('dave'), 'the disjoint claim also succeeds');
  const losers = results.filter((r) => r.code !== 0);
  assert.equal(losers.length, 2);
  for (const l of losers) {
    assert.equal(l.code, 3, l.stderr);
    assert.match(l.stderr, /queued: /);
  }
  // the ledger holds the winners' entries, and every update was a fast-forward of the one before
  const ref = ledgerRef('feat');
  const log = updates(w.bare, ref);
  assert.ok(log.length >= 2);
  for (const [old, now] of log) assert.ok(/^0+$/.test(old) || isAncestor(w.bare, old, now), `update ${old} -> ${now} is a fast-forward`);
  const entries = readEntries(w.clone('check'), sh(w.bare, 'rev-parse', ref)).entries;
  assert.equal(entries.length, 2);
});

test('the same unit claimed by many processes at once: exactly one succeeds', async () => {
  const w = world();
  const names = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const results = await Promise.all(names.map((n, i) => runCli(w.clone(n), ['work', 'claim', 'feat#S3', '--as', n], { GO_GETTER_CLOCK_OFFSET_MS: String((i - 2) * MIN) })));
  assert.equal(results.filter((r) => r.code === 0).length, 1);
  assert.equal(results.filter((r) => r.code === 3).length, 4);
  for (const [old, now] of updates(w.bare, ledgerRef('feat'))) assert.ok(/^0+$/.test(old) || isAncestor(w.bare, old, now));
});

test('a claim records its entry; named resources and shared decision tags overlap', async () => {
  const w = world();
  const a = w.clone('a');
  const r = await claimUnit(a, 'feat#S4', who('alice'), { now: T0 });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.entry.holder, { kind: 'agent', id: 'alice' });
  assert.deepEqual(r.entry.scope, ['interface:api', 'tag:billing']);
  assert.equal(r.entry.expires, at(60).toISOString());
  assert.match(r.entry.brief, /^[0-9a-f]{16}$/);
  const b = await claimUnit(w.clone('b'), 'feat#S5', who('bob'), { now: at(1) });
  assert.equal(b.code, 'queued');
  assert.equal(b.behind.unit, 'feat#S4');
  assert.equal((await claimUnit(w.clone('c'), 'feat#S3', who('carol'), { now: at(1) })).ok, true);
});

test('a delegated child is claimed beside its parent, which then holds no scope', async () => {
  const w = world();
  const parent = await claimUnit(w.clone('a'), 'feat#P', who('lead'), { now: T0 });
  assert.equal(parent.ok, true, parent.error);
  const child = await claimUnit(w.clone('b'), 'feat#S3', who('worker', 'agent'), { now: at(1), issuer: who('lead') });
  assert.equal(child.ok, true, child.error);
  assert.equal(child.entry.parent, 'feat#P');
  // the parent now has a live child and holds no scope tokens, so an unrelated unit the parent's glob covered is free
  const other = await claimUnit(w.clone('c'), 'feat#S1', who('erin'), { now: at(2) });
  assert.equal(other.ok, true, other.error);
  // but the child's own scope still excludes
  assert.equal((await claimUnit(w.clone('d'), 'feat#S3', who('frank'), { now: at(2) })).code, 'queued');
  const view = ledgerView(w.clone('e'), 'feat', { now: at(3), remote: 'origin' });
  const p = view.annotated.states.get('feat#P');
  assert.equal(p.live, true);
  assert.equal(p.holdsScope, false);
  assert.equal(p.children, 2);
});

test('a renewal writes only the heartbeat and checkpoint refs, only under half the lease', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  const ledgerTip = sh(w.bare, 'rev-parse', ledgerRef('feat'));
  const ledgerLog = updates(w.bare, ledgerRef('feat')).length;
  writeFileSync(path.join(a, 'wip.txt'), 'work in progress\n');
  const status = sh(a, 'status', '--porcelain');
  const head = sh(a, 'rev-parse', 'HEAD');
  const fresh = await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(20) });
  assert.deepEqual([fresh.ok, fresh.renewed, fresh.reason], [true, false, 'fresh']);
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/heartbeat'), '');
  const due = await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(40) });
  assert.equal(due.renewed, true, due.error);
  assert.equal(sh(w.bare, 'rev-parse', ledgerRef('feat')), ledgerTip, 'the ledger did not move');
  assert.equal(updates(w.bare, ledgerRef('feat')).length, ledgerLog);
  assert.ok(sh(w.bare, 'rev-parse', heartbeatRef('alice')));
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/checkpoints'), '', 'no checkpoint is pushed');
  assert.deepEqual(sh(w.bare, 'for-each-ref', '--format=%(refname)', 'refs/go-getter').split('\n').sort(), [heartbeatRef('alice'), ledgerRef('feat')].sort(), 'only the heartbeat ref was added');
  assert.equal(sh(a, 'status', '--porcelain'), status, 'the working tree did not change');
  assert.equal(sh(a, 'rev-parse', 'HEAD'), head);
  // a second renewal is a fast-forward of the first
  const first = sh(w.bare, 'rev-parse', heartbeatRef('alice'));
  assert.equal((await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(40 + 40) })).renewed, true);
  assert.ok(isAncestor(w.bare, first, sh(w.bare, 'rev-parse', heartbeatRef('alice'))));
  // the beat extends the lease for everyone who reads the ledger
  // (lease 60 + margin 5 after the beat at minute 80: live at 144, lapsed at 146; without the beat it lapsed at 65)
  const view = (min) => ledgerView(w.clone(`b${min}`), 'feat', { now: at(min), remote: 'origin' }).annotated.states.get('feat#S3').live;
  assert.equal(view(144), true);
  assert.equal(view(146), false);
  assert.equal(readBeats(w.clone('c'), 'origin').beats.get('alice feat#S3').length > 0, true);
});

test('a renewal is skipped offline and never throws', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  sh(a, 'remote', 'set-url', 'origin', path.join(w.base, 'gone.git'));
  const r = await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(45) });
  assert.deepEqual([r.ok, r.renewed, r.reason], [true, false, 'offline']);
});

test('an expired lease, plus the clock margin, is taken over', async () => {
  const w = world();
  await claimUnit(w.clone('a'), 'feat#S3', who('alice'), { now: T0 });
  const early = await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(63) }); // lease ended at 60, margin 5
  assert.equal(early.code, 'queued');
  const late = await claimUnit(w.clone('c'), 'feat#S3', who('carol'), { now: at(66) });
  assert.equal(late.ok, true, late.error);
  assert.equal(late.tookOver.id, 'alice');
  assert.equal(late.entry.counters.claimants, 2);
  const entries = readEntries(w.clone('d'), sh(w.bare, 'rev-parse', ledgerRef('feat'))).entries;
  assert.equal(entries.find((e) => e.unit === 'feat#S3').holder.id, 'carol', 'the takeover is a valid entry');
});

test('a worker whose clock is beyond the margin refuses to claim', async () => {
  const w = world();
  const a = w.clone('a');
  const host = new Date();
  const slow = await claimUnit(a, 'feat#S3', who('alice'), { now: new Date(host.getTime() + 6 * MIN), hostDate: host });
  assert.equal(slow.code, 'clock');
  assert.match(slow.error, /differs from the host's/);
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/claims'), '');
  const ok = await claimUnit(a, 'feat#S3', who('alice'), { now: new Date(host.getTime() + 4 * MIN), hostDate: host });
  assert.equal(ok.ok, true, ok.error);
  const cliRun = await runCli(w.clone('b'), ['work', 'claim', 'feat#S1', '--as', 'bob'], { GO_GETTER_CLOCK_OFFSET_MS: String(10 * MIN) });
  assert.equal(cliRun.code, 1);
  assert.match(cliRun.stderr, /clock differs/);
});

test('a parent with live children never expires, an idle one is flagged, a parked claim never expires', () => {
  const brief = { Scope: ['src/**'] };
  const lead = makeEntry({ unit: 'feat#P', holder: who('lead'), scope: ['src/**'], now: T0, leaseMs: 60 * MIN, brief });
  const kid = makeEntry({ unit: 'feat#S3', holder: who('w'), scope: ['src/b/**'], now: T0, leaseMs: 480 * MIN, brief, parent: 'feat#P' });
  const ctx = (min, extra = {}) => ({ now: at(min).getTime(), skewMs: 5 * MIN, parentIdleMs: 7 * 24 * 60 * MIN, beats: new Map(), ...extra });
  // the parent's own lease is long over, but its child is live
  let v = annotate([lead, kid], ctx(300));
  assert.equal(v.states.get('feat#P').live, true);
  assert.equal(v.states.get('feat#P').holdsScope, false);
  assert.equal(v.states.get('feat#P').idle, false);
  // once the child lapses too the parent has a lease again, and it has lapsed
  v = annotate([lead, kid], ctx(600));
  assert.equal(v.states.get('feat#S3').live, false);
  assert.equal(v.states.get('feat#P').live, false);
  // a parked child never lapses; the parent is idle once nothing has touched either for the idle period
  const parked = { ...kid, state: 'parked' };
  v = annotate([lead, parked], ctx(60 * 24 * 8));
  assert.equal(v.states.get('feat#S3').live, true);
  assert.equal(v.states.get('feat#S3').parked, true);
  assert.equal(v.states.get('feat#P').live, true);
  assert.equal(v.states.get('feat#P').idle, true);
  v = annotate([lead, parked], ctx(60 * 24 * 8, { beats: new Map([['w', at(60 * 24 * 8 - 5).getTime()]]) }));
  assert.equal(v.states.get('feat#P').idle, false, 'a child renewed recently is activity');
  // a parked claim blocks the scope it holds
  assert.equal(conflict(annotate([parked], ctx(60 * 24 * 30)), { unit: 'feat#X', scope: ['src/b/y.mjs'] }).entry.unit, 'feat#S3');
});

test('a release frees the unit at once', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  assert.equal((await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(1) })).code, 'queued');
  const wrong = await releaseUnit(w.clone('c'), 'feat#S3', who('bob'), { now: at(2) });
  assert.equal(wrong.code, 'not-holder');
  const r = await releaseUnit(a, 'feat#S3', who('alice'), { now: at(3) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.entry.state, 'released');
  const b = await claimUnit(w.clone('d'), 'feat#S3', who('bob'), { now: at(4) });
  assert.equal(b.ok, true, b.error);
  assert.equal((await releaseUnit(a, 'feat#S3', who('alice'), { now: at(5) })).code, 'not-holder');
});

test('an entry not authored by its holder or issuer is ignored; a changed grant or scope is ignored', async () => {
  const w = world();
  const a = w.clone('a');
  const forged = makeEntry({ unit: 'feat#S3', holder: who('eve'), scope: ['src/b/**'], now: T0, leaseMs: 60 * MIN, brief: { Scope: ['src/b/**'] } });
  const forgery = commitEntries(a, null, { 'S3.json': forged }, { author: 'mallory', message: 'forged', now: T0 });
  assert.equal(pushRef(a, 'origin', ledgerRef('feat'), forgery, null).ok, true);
  let seen = readEntries(a, fetchLedger(a, 'feat', 'origin').tip);
  assert.equal(seen.entries.length, 0);
  assert.match(seen.ignored[0].reason, /neither holder eve nor issuer/);
  const real = await claimUnit(a, 'feat#S3', who('alice'), { now: at(1) });
  assert.equal(real.ok, true, real.error);
  // alice widens her own scope, and rewrites the grant: both ignored
  let tip = fetchLedger(a, 'feat', 'origin').tip;
  const widened = commitEntries(a, tip, { 'S3.json': { ...real.entry, scope: ['src/**'] } }, { author: 'alice', message: 'widen', now: at(2) });
  assert.equal(pushRef(a, 'origin', ledgerRef('feat'), widened, tip).ok, true);
  tip = widened;
  const granted = commitEntries(a, tip, { 'S3.json': { ...real.entry, grant: { spend: 1e9 } } }, { author: 'alice', message: 'grant', now: at(3) });
  assert.equal(pushRef(a, 'origin', ledgerRef('feat'), granted, tip).ok, true);
  seen = readEntries(a, granted);
  assert.deepEqual(seen.entries[0].scope, ['src/b/**']);
  assert.equal(seen.entries[0].grant, null);
  assert.equal(seen.ignored.length, 3, 'the forgery, the widened scope and the changed grant');
  assert.equal((await claimUnit(w.clone('b'), 'feat#S1', who('bob'), { now: at(4) })).ok, true, 'the widened scope was never in force');
  // a release by the holder (scope emptied) is a valid change
  const empty = validEntry([{ entry: real.entry, author: 'alice', commit: 'c1' }, { entry: { ...real.entry, state: 'released', scope: [] }, author: 'alice', commit: 'c2' }]);
  assert.equal(empty.entry.state, 'released');
});

test('a secret in a brief is refused, including a quoted assignment', async () => {
  const w = world();
  const a = w.clone('a');
  const leaky = (do_) => writeFileSync(path.join(a, 'docs/plans/leaky.md'), `# Leaky\n\n## Phase\nId: P\n\n### S1 One — [ ]\nClass: implement · Needs: none · Scope: src/c/** · Check: \`true\`\nDo: ${do_}\n`);
  leaky('set the token ghp_abcdefghijklmnopqrstuvwxyz0123456789 in the setup.');
  const r = await claimUnit(a, 'leaky#S1', who('alice'), { now: T0 });
  assert.equal(r.code, 'sensitive');
  assert.match(r.error, /github/);
  assert.doesNotMatch(r.error, /ghp_/);
  leaky('export API_KEY="abcdef0123456789abcdef0123" before the build.');
  const q = await claimUnit(a, 'leaky#S1', who('alice'), { now: T0 });
  assert.equal(q.code, 'sensitive', 'a quoted assignment is seen, not hidden by JSON escaping');
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/claims'), '');
});

test('without a remote the claim is local and says so', async () => {
  const w = world({ remote: false });
  const a = w.clone('a');
  const r = await claimUnit(a, 'feat#S1', who('alice'), { now: T0 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.local, true);
  assert.match(r.note, /no remote/);
  assert.equal((await claimUnit(a, 'feat#S2', who('bob'), { now: at(1) })).code, 'queued');
  const cliRun = await runCli(a, ['work', 'claim', 'feat#S3', '--as', 'carol']);
  assert.equal(cliRun.code, 0, cliRun.stderr);
  assert.match(cliRun.stderr, /no remote/);
  assert.ok(sh(a, 'rev-parse', ledgerRef('feat')));
});

test('an unknown unit, a settled unit and a malformed reference are refused', async () => {
  const w = world();
  const a = w.clone('a');
  assert.equal((await claimUnit(a, 'feat#NOPE', who('alice'), { now: T0 })).code, 'unknown-unit');
  assert.equal((await claimUnit(a, 'S1', who('alice'), { now: T0 })).code, 'unknown-unit');
  assert.equal((await runCli(a, ['work', 'claim'])).code, 2);
  assert.equal((await runCli(a, ['work', 'claim', 'feat#S1', '--kind', 'robot'])).code, 2);
});

test('a renewal makes no tracker call; a claim and a release comment once each where writes are allowed', async () => {
  const w = world();
  const a = w.clone('a');
  mkdirSync(path.join(a, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(a, 'docs/decisions/0001-writes.md'), '---\nid: 0001-writes\ntitle: Tracker writes are allowed\nstatus: active\ndate: 2026-11-04\ntags: [tracker]\ngo-getter:\n  tracker-writes: allow\n---\n\n## Decision\n\nAllow.\n');
  settings(a, SHORT);
  const bin = path.join(tmp(), 'bin');
  mkdirSync(bin);
  const log = path.join(bin, 'calls.log');
  writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$@" >> "${log}"\ncat > /dev/null\n`);
  chmodSync(path.join(bin, 'gh'), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}`, GO_GETTER_WORKER_KIND: 'human' };
  const claim = await runCli(a, ['work', 'claim', 'feat#S1', '--as', 'alice'], env);
  assert.equal(claim.code, 0, claim.stderr);
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  assert.equal(calls().length, 1, 'one comment for the claim');
  assert.match(calls()[0], /issue comment/);
  writeFileSync(path.join(a, 'wip.txt'), 'x\n');
  const before = sh(a, 'status', '--porcelain');
  const beat = await runCli(a, ['work', 'heartbeat', 'feat#S1', '--as', 'alice'], { ...env, GO_GETTER_CLOCK_OFFSET_MS: String(3 * MIN) });
  assert.equal(beat.code, 0, beat.stderr);
  assert.match(beat.stdout, /renewed/);
  assert.equal(calls().length, 1, 'the renewal made no tracker call');
  assert.equal(sh(a, 'status', '--porcelain'), before);
  const rel = await runCli(a, ['work', 'release', 'feat#S1', '--as', 'alice'], env);
  assert.equal(rel.code, 0, rel.stderr);
  assert.equal(calls().length, 2);
});

test('every go-getter verb renews a lease that is under half, and go-getter\'s own pushes do not recurse', async () => {
  const w = world();
  const a = w.clone('a');
  settings(a, SHORT);
  await runCli(a, ['work', 'claim', 'feat#S3', '--as', 'alice']);
  const none = await runCli(a, ['plan', 'status', 'docs/plans/feat.md']);
  assert.equal(none.code, 0, none.stderr);
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/heartbeat'), '', 'plenty of lease left: nothing pushed');
  await runCli(a, ['plan', 'status', 'docs/plans/feat.md'], { GO_GETTER_CLOCK_OFFSET_MS: String(3 * MIN) });
  assert.ok(sh(w.bare, 'rev-parse', heartbeatRef('alice')), 'a verb late in the lease renewed it');
  const guarded = sh(w.bare, 'rev-parse', heartbeatRef('alice'));
  await runCli(a, ['plan', 'status', 'docs/plans/feat.md'], { GO_GETTER_CLOCK_OFFSET_MS: String(9 * MIN), GO_GETTER_REENTRY: '1' });
  assert.equal(sh(w.bare, 'rev-parse', heartbeatRef('alice')), guarded, 'a push made by go-getter does not trigger another');
});

test('plan status shows a unit with a live claim as in progress', async () => {
  const w = world();
  const a = w.clone('a');
  await runCli(a, ['work', 'claim', 'feat#S3', '--as', 'alice']);
  const out = await runCli(a, ['plan', 'status', 'docs/plans/feat.md', '--json']);
  assert.equal(out.code, 0, out.stderr);
  const s3 = JSON.parse(out.stdout).steps.find((s) => s.id === 'S3');
  assert.equal(s3.status, 'in progress');
  assert.equal(s3.claim.holder, 'alice');
  const text = await runCli(a, ['plan', 'status', 'docs/plans/feat.md']);
  assert.match(text.stdout, /S3 Three.*claimed by agent alice/);
});

test('the brief version hashes the brief fields only', () => {
  assert.equal(briefVersion({ Do: 'x', Scope: ['a'] }), briefVersion({ Scope: ['a'], Do: 'x' }));
  assert.notEqual(briefVersion({ Do: 'x' }), briefVersion({ Do: 'y' }));
});

// ---- review fixes

const treeFiles = (bare, ref) => sh(bare, 'ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean);

test('H3: --parent must name an existing unit with a live claim of the claimant, or be the unit\'s own Parent', async () => {
  const w = world();
  assert.equal((await claimUnit(w.clone('a'), 'feat#S3', who('x'), { now: T0, parent: 'feat#NOPE' })).code, 'bad-parent');
  // S4 is not S3's parent and has no claim
  assert.match((await claimUnit(w.clone('b'), 'feat#S3', who('x'), { now: T0, parent: 'feat#S4' })).error, /no live claim/);
  assert.equal((await claimUnit(w.clone('c'), 'feat#S4', who('victim'), { now: T0 })).ok, true);
  const hijack = await claimUnit(w.clone('d'), 'feat#S3', who('mallory'), { now: at(1), parent: 'feat#S4' });
  assert.equal(hijack.code, 'bad-parent');
  assert.match(hijack.error, /held by victim/);
  const view = ledgerView(w.clone('e'), 'feat', { now: at(2), remote: 'origin' });
  assert.equal(view.annotated.states.get('feat#S4').children, 0, 'the victim\'s unit kept its lease');
  // the holder may add a child of its own, and the plan's own Parent needs no entry
  assert.equal((await claimUnit(w.clone('f'), 'feat#S3', who('victim'), { now: at(3), parent: 'feat#S4' })).ok, true);
  assert.equal((await claimUnit(w.clone('g'), 'feat#S1', who('anyone'), { now: at(3), parent: 'feat#P' })).ok, true);
});

test('H4: a host clock that cannot be learned blocks a takeover, and a bad or skewed host date blocks a claim or a renewal', async () => {
  const w = world();
  await claimUnit(w.clone('a'), 'feat#S3', who('alice'), { now: T0 });
  const blocked = await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(70), hostDate: null });
  assert.equal(blocked.code, 'clock-unverified');
  const fresh = await claimUnit(w.clone('c'), 'feat#S1', who('carol'), { now: at(70), hostDate: null });
  assert.equal(fresh.code, 'clock-unverified', 'a fresh claim needs a host time too (decision 0166 item 2)');
  assert.equal((await claimUnit(w.clone('d'), 'feat#S3', who('dan'), { now: at(70), hostDate: new Date('not a date') })).code, 'clock');
  const ok = await claimUnit(w.clone('e'), 'feat#S3', who('erin'), { now: at(70), hostDate: at(71) });
  assert.equal(ok.ok, true, ok.error);
  // a renewal checks too
  const a2 = w.clone('f');
  await claimUnit(a2, 'feat#S5', who('fay'), { now: T0 });
  const skewed = await heartbeatUnit(a2, 'feat#S5', who('fay'), { now: at(40), hostDate: at(50) });
  assert.equal(skewed.code, 'clock');
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/heartbeat/fay'), '');
});

test('H5 and M-e: the default worker id names no person or host, is unique per worktree and survives a rename; only the exact holder releases', async () => {
  const env = { USER: 'sam', CI: '' };
  const one = identity('/work/one', {}, env);
  const two = identity('/work/two', {}, env);
  assert.notEqual(one.id, two.id);
  assert.match(one.id, /^w-[0-9a-f]{12}$/);
  assert.doesNotMatch(one.id, /sam/);
  assert.equal(identity('/work/one', {}, env).id, one.id, 'stable for one worktree');
  assert.notEqual(identity('/work/one', {}, { ...env, GITHUB_RUN_ID: '991' }).id, one.id);
  assert.equal(identity('/work/one', { as: 'me@example.test' }, env).id, 'me-example.test');
  assert.equal(identity('/work/one', {}, { ...env, CI: 'true' }).kind, 'ci');
  assert.throws(() => identity('/work/one', {}, { ...env, GO_GETTER_WORKER_KIND: 'robot' }), /not one of/);
  assert.throws(() => identity('/work/one', { as: 'a..b' }, env), /not usable/);
  assert.throws(() => identity('/work/one', { as: 'x.lock' }, env), /not usable/);
  const w = world();
  const a = w.clone('a');
  const first = identity(a, {}, { USER: 'sam' });
  assert.equal(identity(a, {}, { USER: 'someone-else' }).id, first.id, 'stored once per worktree: a changed user or host name keeps the claims');
  const moved = path.join(w.base, 'a-moved');
  sh(a, 'worktree', 'add', '-q', path.join(w.base, 'wt1'), '-b', 'wt1');
  const wt1 = identity(path.join(w.base, 'wt1'), {}, { USER: 'sam' });
  assert.notEqual(wt1.id, first.id);
  sh(a, 'worktree', 'move', path.join(w.base, 'wt1'), moved);
  assert.equal(identity(moved, {}, { USER: 'sam' }).id, wt1.id, 'a moved worktree keeps its id');
  await claimUnit(a, 'feat#S3', who('worker'), { now: T0, issuer: who('lead') });
  const byIssuer = await releaseUnit(w.clone('b'), 'feat#S3', who('lead'), { now: at(1) });
  assert.equal(byIssuer.code, 'not-holder');
  assert.equal((await releaseUnit(a, 'feat#S3', who('worker'), { now: at(2) })).ok, true);
});

test('L4 and L5: a bad worker kind and an issuer without a kind are usage errors; the issuer keeps its own kind', async () => {
  const w = world();
  const a = w.clone('a');
  assert.equal((await runCli(a, ['work', 'claim', 'feat#S3'], { GO_GETTER_WORKER_KIND: 'robot' })).code, 2);
  assert.equal((await runCli(a, ['work', 'claim', 'feat#S3', '--issuer', 'lead'])).code, 2);
  const r = await runCli(a, ['work', 'claim', 'feat#S3', '--as', 'worker', '--issuer', 'lead', '--issuer-kind', 'human']);
  assert.equal(r.code, 0, r.stderr);
  const tip = sh(w.bare, 'rev-parse', ledgerRef('feat'));
  const entry = readEntries(a, tip).entries[0];
  assert.deepEqual([entry.holder, entry.issuer], [{ kind: 'agent', id: 'worker' }, { kind: 'human', id: 'lead' }]);
});

test('M1: a failed heartbeat fetch is offline, not an empty cache', () => {
  const w = world();
  const a = w.clone('a');
  assert.equal(readBeats(a, path.join(w.base, 'gone.git')).online, false);
  assert.equal(readBeats(a, 'origin').online, true);
});

test('N1: a heartbeat dated beyond now plus the margin is ignored, so a claim kept only by one lapses', async () => {
  const w = world();
  const a = w.clone('a');
  assert.equal((await claimUnit(a, 'feat#S3', who('alice'), { now: T0 })).ok, true);
  assert.equal(pushHeartbeat(a, 'origin', 'alice', ['feat#S3'], new Date(T0.getTime() + 10 * 24 * 60 * MIN)).ok, true);
  assert.equal(readBeats(a, 'origin', { nowMs: T0.getTime(), skewMs: 5 * MIN }).beats.has('alice feat#S3'), false);
  const live = (min) => ledgerView(w.clone(`v${min}`), 'feat', { now: at(min), remote: 'origin' }).annotated.states.get('feat#S3').live;
  assert.equal(live(30), true);
  assert.equal(live(66), false, 'the far-future beat did not extend the lease');
  assert.equal((await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(66) })).ok, true);
});

test('M3: another claimant replaces an entry only after expiry plus the margin, never a parked one or a parent with live children', () => {
  const brief = { Scope: ['src/b/**'] };
  const mk = (id, min, extra = {}) => ({ ...makeEntry({ unit: 'feat#S3', holder: who(id), scope: ['src/b/**'], now: at(min), leaseMs: 60 * MIN, brief }), ...extra });
  const pair = (second) => [{ entry: mk('alice', 0), author: 'alice', commit: 'c1' }, { entry: second, author: second.holder.id, commit: 'c2' }];
  const skew = 5 * MIN;
  assert.equal(validEntry(pair(mk('bob', 62)), { skewMs: skew }).entry.holder.id, 'alice', 'inside the margin');
  assert.equal(validEntry(pair(mk('bob', 65)), { skewMs: skew }).entry.holder.id, 'bob', 'at expiry plus margin');
  const parked = [{ entry: { ...mk('alice', 0), state: 'parked' }, author: 'alice', commit: 'c1' }, { entry: mk('bob', 600), author: 'bob', commit: 'c2' }];
  assert.equal(validEntry(parked, { skewMs: skew, allowParked: true }).entry.holder.id, 'alice');
  assert.equal(validEntry(pair(mk('bob', 65)), { skewMs: skew, blocked: () => true }).entry.holder.id, 'alice', 'a unit with live children');
});

test('M4: a ledger that is not a descendant of the last one seen is not trusted', async () => {
  const w = world();
  const b = w.clone('b');
  assert.equal((await claimUnit(b, 'feat#S1', who('bob'), { now: T0 })).ok, true);
  const forged = commitEntries(b, null, {}, { author: 'mallory', message: 'rewrite', now: at(1) });
  sh(b, 'push', '--force', 'origin', `${forged}:${ledgerRef('feat')}`);
  const r = await claimUnit(b, 'feat#S4', who('bob'), { now: at(2) });
  assert.equal(r.code, 'diverged');
  assert.equal(sh(b, 'rev-parse', 'refs/go-getter/cache/claims/feat') !== forged, true, 'the cache keeps the version that was trusted');
  assert.equal((await releaseUnit(b, 'feat#S1', who('bob'), { now: at(3) })).code, 'diverged');
});

test('M9: the claims record is replaced atomically and keeps other claims; a torn file reads as empty', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  updateRecord(a, (r) => (r.claims['feat#X'] = { worker: who('alice'), worktree: a }));
  updateRecord(a, (r) => (r.claims['feat#Y'] = { worker: who('alice'), worktree: a }));
  assert.deepEqual(Object.keys(readRecord(a).claims).sort(), ['feat#S3', 'feat#X', 'feat#Y']);
  assert.deepEqual(readdirSync(path.join(a, '.git')).filter((f) => f.endsWith('.tmp')), []);
  writeFileSync(path.join(a, '.git/go-getter-claims.json'), '{"claims": {"feat#S3"');
  assert.deepEqual(readRecord(a), { claims: {} });
});

test('M10 and L9: the test clock is ignored without the test guard, and renewal works from a subdirectory', async () => {
  const w = world();
  const a = w.clone('a');
  const r = await runCli(a, ['work', 'claim', 'feat#S3', '--as', 'alice'], { GO_GETTER_CLOCK_OFFSET_MS: String(10 * MIN), GO_GETTER_TEST_MODE: '' });
  assert.equal(r.code, 0, `the shifted clock was ignored: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /TEST MODE/);
  const guarded = await runCli(w.clone('b'), ['work', 'claim', 'feat#S1', '--as', 'bob'], { GO_GETTER_CLOCK_OFFSET_MS: String(10 * MIN) });
  assert.match(guarded.stderr, /TEST MODE: the clock is shifted/);
  assert.equal(guarded.code, 1);
  // renewal from docs/, under the lease of 4 minutes
  const c = w.clone('c');
  settings(c, SHORT);
  await claimUnit(c, 'feat#S5', who('carol'), { now: new Date() });
  const sub = path.join(c, 'docs');
  const renewed = await renewAll(sub, { GO_GETTER_TEST_MODE: '1', GO_GETTER_CLOCK_OFFSET_MS: String(3 * MIN) });
  assert.deepEqual(renewed, ['feat#S5']);
  assert.ok(sh(w.bare, 'rev-parse', heartbeatRef('carol')));
});

// ---- second review

test('N2: renewal covers only claims held from this worktree, and a heartbeat names only those units', async () => {
  const w = world();
  const a = w.clone('a');
  const other = path.join(w.base, 'a-wt');
  sh(a, 'worktree', 'add', '-q', other, '-b', 'other');
  settings(a, SHORT);
  settings(other, SHORT);
  const now = Date.now();
  assert.equal((await claimUnit(a, 'feat#S3', who('alice'), { now: new Date(now - 3 * MIN) })).ok, true); // 1 of 4 minutes left: due
  assert.equal((await claimUnit(other, 'feat#S1', who('alice'), { now: new Date(now) })).ok, true); // not due
  assert.deepEqual(await renewAll(other, {}), [], 'the other worktree\'s renewal does not keep a\'s claim alive');
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/heartbeat'), '');
  assert.deepEqual(await renewAll(a, {}), ['feat#S3']);
  assert.match(sh(w.bare, 'log', '-1', '--format=%s', heartbeatRef('alice')), /^heartbeat \d+ feat#S3$/, 'it names only this worktree\'s unit');
  const view = ledgerView(w.clone('v'), 'feat', { now: new Date(now + 1 * MIN), remote: 'origin' }).annotated.states;
  assert.equal(view.get('feat#S3').live, true);
  // a's claim on S1 would not be renewed by a heartbeat for S3: the beat is per unit
  const times = beatTimes(a, 'origin', {});
  sh(a, 'fetch', 'origin', `+${'refs/go-getter/heartbeat'}/*:refs/go-getter/cache/heartbeat/*`);
  assert.equal(times('alice', 'feat#S1').length, 0);
  assert.equal(times('alice', 'feat#S3').length, 1);
  assert.equal((await heartbeatUnit(a, 'feat#S1', who('alice'), { now: new Date(now + 3 * MIN) })).code, 'not-held', 'from a, S1 is not held');
});

test('N6: only an absolute path or file:// remote is local; every other form goes through the host time path', async () => {
  const w = world();
  const a = w.clone('a');
  const asked = [];
  const fetchImpl = async (url) => (asked.push(url), { headers: { get: () => 'Wed, 04 Nov 2026 09:00:00 GMT' } });
  const via = async (url) => {
    sh(a, 'remote', 'set-url', 'origin', url);
    return hostDateFor(a, 'origin', { fetchImpl });
  };
  assert.ok((await via('/srv/git/x.git')) instanceof Date);
  assert.ok((await via('file:///srv/git/x.git')) instanceof Date);
  assert.ok((await via('barelabel')) instanceof Date, 'a bare directory name is a local path, not a host');
  assert.deepEqual(asked, [], 'a local remote is not probed');
  for (const url of ['git@git.example.test:team/x.git', 'git.example.test:team/x.git', 'git+ssh://u:pw@git.example.test:22/team/x.git', 'ssh+git://git.example.test/team/x.git', 'ssh://git@git.example.test/x.git']) {
    asked.length = 0;
    const d = await via(url);
    assert.equal(d.toISOString(), '2026-11-04T09:00:00.000Z', url);
    assert.deepEqual(asked, ['https://git.example.test/'], `${url} is probed at its host, with no credentials`);
  }
  assert.equal(remoteHost('https://user:tok@h.test:8443/p'), 'h.test');
  assert.equal(remoteHost('../relative.git'), null);
  asked.length = 0;
  assert.ok((await via('https://user:tok@git.example.test/x.git')) instanceof Date);
  assert.deepEqual(asked, ['https://git.example.test/x.git'], 'credentials are stripped from the probe of an https remote');
});

test('N7: when the https probe fails a fresh claim goes ahead, and a takeover is refused with the way out', async () => {
  const w = world();
  const a = w.clone('a');
  sh(a, 'remote', 'set-url', 'origin', 'git@git.example.test:team/x.git');
  assert.equal(await hostDateFor(a, 'origin', { fetchImpl: async () => { throw new Error('no route'); } }), null);
  await claimUnit(w.clone('b'), 'feat#S3', who('alice'), { now: T0 });
  const r = await claimUnit(w.clone('c'), 'feat#S3', who('bob'), { now: at(70), hostDate: null });
  assert.equal(r.code, 'clock-unverified');
  assert.match(r.error, /work release feat#S3/);
  assert.match(r.error, /--as alice/);
  assert.match(r.error, /https remote/);
  assert.match(r.error, /could not be learned/);
});

test('M-a: a takeover waits out the holder\'s latest heartbeat before it', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  assert.equal((await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(40) })).renewed, true);
  // lease now runs to minute 100 (+5 margin): a claim at 70 is queued by the writer; a forged takeover is ignored by readers
  assert.equal((await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(70) })).code, 'queued');
  const c = w.clone('c');
  const tip = fetchLedger(c, 'feat', 'origin').tip;
  const forged = commitEntries(c, tip, { 'S3.json': makeEntry({ unit: 'feat#S3', holder: who('bob'), scope: ['src/b/**'], now: at(70), leaseMs: 60 * MIN, brief: {} }) }, { author: 'bob', message: 'take', now: at(70) });
  assert.equal(pushRef(c, 'origin', ledgerRef('feat'), forged, tip).ok, true);
  const seen = ledgerView(c, 'feat', { now: at(71), remote: 'origin' });
  assert.equal(seen.entries[0].holder.id, 'alice');
  assert.match(seen.ignored[0].reason, /has not lapsed/);
  const later = ledgerView(w.clone('d'), 'feat', { now: at(110), remote: 'origin' });
  assert.equal(later.entries[0].holder.id, 'alice', 'bob\'s entry is still ignored; a valid takeover would be written at 106 or later');
});

test('M-b: readers reject a lease longer than configured and an expiry beyond created plus the lease', () => {
  const brief = { Scope: ['src/b/**'] };
  const e = makeEntry({ unit: 'feat#S3', holder: who('alice'), scope: ['src/b/**'], now: T0, leaseMs: 60 * MIN, brief });
  const max = { agent: 60 * MIN, human: 480 * MIN, ci: 60 * MIN };
  const check = (entry) => validEntry([{ entry, author: 'alice', commit: 'c1' }], { maxLeaseMs: max });
  assert.ok(check(e).entry);
  assert.match(check({ ...e, leaseMs: 100 * 24 * 60 * MIN, expires: new Date(T0.getTime() + 100 * 24 * 60 * MIN).toISOString() }).ignored[0].reason, /longer than/);
  assert.match(check({ ...e, expires: new Date(T0.getTime() + 10 * 24 * 60 * MIN).toISOString() }).ignored[0].reason, /later than created plus the lease/);
  assert.match(validEntry([{ entry: { ...e, created: at(600).toISOString(), expires: at(660).toISOString() }, author: 'alice', commit: 'c1' }], { maxLeaseMs: max, nowMs: T0.getTime(), skewMs: 5 * MIN }).ignored[0].reason, /future/);
});

test('M-c: a deleted or rewritten ledger is not silently trusted; --accept-remote-ledger is the documented way out', async () => {
  const w = world();
  const b = w.clone('b');
  assert.equal((await claimUnit(b, 'feat#S1', who('bob'), { now: T0 })).ok, true);
  sh(w.bare, 'update-ref', '-d', ledgerRef('feat'));
  const r = await claimUnit(b, 'feat#S4', who('bob'), { now: at(1) });
  assert.equal(r.code, 'diverged');
  assert.match(r.error, /--accept-remote-ledger/);
  assert.match(r.error, /git update-ref -d refs\/go-getter\/cache\/claims\/feat/);
  assert.equal((await releaseUnit(b, 'feat#S1', who('bob'), { now: at(2) })).code, 'diverged');
  const cli = await runCli(b, ['work', 'claim', 'feat#S4', '--as', 'bob']);
  assert.equal(cli.code, 1);
  const ok = await runCli(b, ['work', 'claim', 'feat#S4', '--as', 'bob', '--accept-remote-ledger']);
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(readEntries(b, sh(w.bare, 'rev-parse', ledgerRef('feat'))).entries.length, 1, 'the new ledger holds only the new claim');
});

test('parked: a parked state written by hand is ignored until K7 provides a validated path', async () => {
  const w = world();
  const a = w.clone('a');
  const r = await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  const tip = fetchLedger(a, 'feat', 'origin').tip;
  const parked = commitEntries(a, tip, { 'S3.json': { ...r.entry, state: 'parked', updated: at(1).toISOString() } }, { author: 'alice', message: 'park', now: at(1) });
  assert.equal(pushRef(a, 'origin', ledgerRef('feat'), parked, tip).ok, true);
  const view = ledgerView(a, 'feat', { now: at(600), remote: 'origin' });
  assert.match(view.ignored[0].reason, /parked has no validated source/);
  assert.equal(view.annotated.states.get('feat#S3').live, false, 'it lapses like any lease');
});

// ---- third review

test('M1a: a heartbeat made after the lease ended (plus the margin) cannot revive the claim; one made in time counts', async () => {
  const brief = { Scope: ['src/b/**'] };
  const e = makeEntry({ unit: 'feat#S3', holder: who('alice'), scope: ['src/b/**'], now: T0, leaseMs: 60 * MIN, brief });
  const ms = (min) => at(min).getTime();
  assert.equal(lastValidBeat(e, [ms(40)], 5 * MIN), ms(40));
  assert.equal(lastValidBeat(e, [ms(40), ms(100)], 5 * MIN), ms(100), 'minute 100 is within the lease renewed at 40');
  assert.equal(lastValidBeat(e, [ms(40), ms(106)], 5 * MIN), ms(40), 'minute 106 is past 100 plus the margin');
  assert.equal(lastValidBeat(e, [ms(66)], 5 * MIN), 0, 'after expiry plus margin');
  assert.equal(lastValidBeat(e, [ms(80), ms(81)], 5 * MIN), 0);
  const w = world();
  const a = w.clone('a');
  assert.equal((await claimUnit(a, 'feat#S3', who('alice'), { now: T0 })).ok, true);
  assert.equal(pushHeartbeat(a, 'origin', 'alice', ['feat#S3'], at(80)).ok, true);
  const view = ledgerView(w.clone('v'), 'feat', { now: at(90), remote: 'origin' });
  assert.equal(view.annotated.states.get('feat#S3').live, false, 'the late beat did not revive it');
  const bob = await claimUnit(w.clone('b'), 'feat#S3', who('bob'), { now: at(90) });
  assert.equal(bob.ok, true, bob.error);
});

test('M1a: a heartbeat refuses a lapsed lease and tells the holder to claim again', async () => {
  const w = world();
  const a = w.clone('a');
  await claimUnit(a, 'feat#S3', who('alice'), { now: T0 });
  const r = await heartbeatUnit(a, 'feat#S3', who('alice'), { now: at(70) });
  assert.equal(r.code, 'lapsed');
  assert.match(r.error, /work claim feat#S3/);
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/heartbeat'), '');
});

test('M1b: a claim whose entry readers do not see after the push is reported as lost, not as won', async () => {
  const w = world();
  const a = w.clone('a');
  const other = w.clone('other');
  const hooks = {
    afterPush: async () => {
      // another writer's commit removes the entry from the ledger right after the claimant's push
      const tip = fetchLedger(other, 'feat', 'origin').tip;
      const del = commitEntries(other, tip, { 'S3.json': null }, { author: 'mallory', message: 'delete', now: at(1) });
      assert.equal(pushRef(other, 'origin', ledgerRef('feat'), del, tip).ok, true);
    },
  };
  const r = await claimUnit(a, 'feat#S3', who('alice'), { now: T0, hooks });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'lost-race');
  assert.equal(readRecord(a).claims['feat#S3'], undefined, 'nothing is recorded as held');
});

test('M2: a fresh claim is refused when the host time cannot be learned, unless the owner passes the override', async () => {
  const w = world();
  const refused = await claimUnit(w.clone('a'), 'feat#S3', who('alice'), { now: T0, hostDate: null });
  assert.equal(refused.code, 'clock-unverified');
  assert.match(refused.error, /https/);
  assert.match(refused.error, /--unverified-clock/);
  assert.equal(sh(w.bare, 'for-each-ref', 'refs/go-getter/claims'), '');
  const forced = await claimUnit(w.clone('b'), 'feat#S3', who('alice'), { now: T0, hostDate: null, unverifiedClock: true });
  assert.equal(forced.ok, true, forced.error);
  assert.match(forced.note, /^WARNING: --unverified-clock/);
  // the override never takes over a lapsed claim
  const takeover = await claimUnit(w.clone('c'), 'feat#S3', who('bob'), { now: at(70), hostDate: null, unverifiedClock: true });
  assert.equal(takeover.code, 'clock-unverified');
  // a local path remote still uses this machine's clock
  const cli = await runCli(w.clone('d'), ['work', 'claim', 'feat#S1', '--as', 'dan']);
  assert.equal(cli.code, 0, cli.stderr);
});

async function interleaved(w, competing) {
  const a = w.clone('a');
  const other = w.clone('other');
  const calls = [];
  const hooks = {
    beforePush: async ({ attempt }) => {
      calls.push(attempt);
      if (attempt > 0) return;
      // between the claimant's read and its push, another worker's claim lands
      const tip = fetchLedger(other, 'feat', 'origin').tip;
      const entry = makeEntry({ unit: competing.unit, holder: who('winner'), scope: competing.scope, now: T0, leaseMs: 60 * MIN, brief: {} });
      const c = commitEntries(other, tip, { [competing.file]: entry }, { author: 'winner', message: 'claim', now: T0 });
      assert.equal(pushRef(other, 'origin', ledgerRef('feat'), c, tip).ok, true);
    },
  };
  const result = await claimUnit(a, 'feat#S1', who('loser'), { now: at(1), hooks });
  for (const [old, now] of updates(w.bare, ledgerRef('feat'))) assert.ok(/^0+$/.test(old) || isAncestor(w.bare, old, now), 'every update was a fast-forward');
  return { result, calls, entries: readEntries(a, sh(w.bare, 'rev-parse', ledgerRef('feat'))).entries };
}

test('M6: a claimant whose push loses the race to an overlapping claim retries, re-checks and is queued behind the winner', async () => {
  const { result, calls, entries } = await interleaved(world(), { unit: 'feat#S2', file: 'S2.json', scope: ['src/a/x.mjs'] });
  assert.equal(result.code, 'queued');
  assert.equal(result.behind.unit, 'feat#S2');
  assert.deepEqual(calls, [0], 'one push was attempted and refused; the retry found the conflict before pushing');
  assert.deepEqual(entries.map((e) => e.unit), ['feat#S2']);
});

test('M6: a claimant that loses the race to a disjoint claim retries and wins', async () => {
  const { result, calls, entries } = await interleaved(world(), { unit: 'feat#S3', file: 'S3.json', scope: ['src/b/**'] });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls, [0, 1], 'refused once, accepted on the retry');
  assert.deepEqual(entries.map((e) => e.unit).sort(), ['feat#S1', 'feat#S3']);
});
