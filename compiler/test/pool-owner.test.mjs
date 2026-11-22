// WP5 of docs/plans/worktree-pool.md: ownership and liveness, reusing the work-claim identity and lease settings.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poolFixture } from './helpers/pool-fixture.mjs';

let fx;
afterEach(() => fx?.cleanup());
const HOURS = (h) => ({ GO_GETTER_CLOCK_OFFSET_MS: String(h * 3600e3) });
const ok = (r) => { assert.equal(r.code, 0, r.err); return r; };
const slotsJson = (env) => ok(fx.run(['pool', 'status', '--json'], { env })).json().slots;
function claimed(n, branch, extra = {}) {
  const dir = fx.freeSlot(n);
  fx.git(dir, 'switch', '-qc', branch);
  fx.commit(dir, `${n}.txt`, 'x\n', `feat: ${branch}`);
  fx.git(dir, 'push', '-q', 'origin', branch);
  fx.writeLease(n, { branch, worker: `w-${n}`, session: `s-${n}`, ...extra });
  return dir;
}

test('a live owner keeps its slot at any claim age, a lapsed one is shown with the age', () => {
  fx = poolFixture();
  claimed(1, 'feat/alive', { claimedAt: new Date(Date.now() - 30 * 3600e3).toISOString(), heartbeatAt: new Date().toISOString() });
  claimed(2, 'feat/gone', { claimedAt: new Date(Date.now() - 3 * 3600e3).toISOString() });
  const s = slotsJson();
  assert.equal(s[0].owner.state, 'live');
  assert.equal(s[1].owner.state, 'lapsed', 'the claim is three hours old and never beat');
  assert.ok(s[1].owner.ageSeconds >= 3 * 3600);
  const results = ok(fx.run(['pool', 'reap', '--sync', '--json'])).json();
  assert.equal(results.find((r) => r.slot === 'pool-01').action, 'keep', 'live owner untouched at any age');
  assert.equal(results.find((r) => r.slot === 'pool-02').action, 'freed');
  assert.match(results.find((r) => r.slot === 'pool-02').reason, /owner ended .* pushed and clean/);
});

test('a lapsed owner with unsaved work keeps the slot, and status lists it as orphaned', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/dirty-and-gone');
  fx.write(dir, 'wip.txt', 'x\n');
  const r = ok(fx.run(['pool', 'reap', '--sync', '--json'], { env: HOURS(48) })).json()[0];
  assert.equal(r.action, 'keep');
  assert.equal(r.keep, 'orphaned');
  assert.ok(fx.readLease(1));
});

test('a lapsed owner never frees a slot whose pull request is open or closed-unmerged', () => {
  fx = poolFixture();
  claimed(1, 'feat/open-pr');
  claimed(2, 'feat/closed-pr');
  fx.setPrs([{ number: 1, head: 'feat/open-pr', state: 'OPEN' }, { number: 2, head: 'feat/closed-pr', state: 'CLOSED', mergedAt: null }]);
  const r = ok(fx.run(['pool', 'reap', '--sync', '--json'], { env: HOURS(48) })).json();
  assert.deepEqual(r.map((x) => x.keep), ['open-pr', 'closed-unmerged']);
});

test('a go-getter verb run inside a slot is a sign of life', () => {
  fx = poolFixture();
  claimed(1, 'feat/working');
  assert.equal(fx.readLease(1).heartbeatAt, undefined);
  ok(fx.run(['pool', 'status'], { cwd: fx.slot(1), env: HOURS(2) }));
  const beat = fx.readLease(1).heartbeatAt;
  assert.ok(Date.parse(beat) > Date.now() + 3600e3, 'the beat carries the shifted clock');
  assert.equal(slotsJson(HOURS(2))[0].owner.state, 'live');
  assert.equal(slotsJson(HOURS(10))[0].owner.state, 'lapsed');
});

test('acquire records the worker identity, its kind and a first beat', () => {
  fx = poolFixture();
  // identity() says `ci` under CI; the kind is pinned so the test reads the same on a laptop and on a runner.
  const lease = (ok(fx.run(['pool', 'acquire', '--branch', 'feat/id'], { env: { CI: '', GITHUB_RUN_ID: '', GO_GETTER_WORKER_KIND: 'agent' } })), fx.readLease(1));
  assert.match(lease.worker, /^w-[0-9a-f]{12}$/);
  assert.equal(lease.workerKind, 'agent');
  assert.equal(lease.heartbeatAt, lease.claimedAt);
});

test('a lease with no session id says only the ttl applies', () => {
  fx = poolFixture();
  claimed(1, 'feat/nosession', { session: null });
  assert.match(slotsJson()[0].owner.note, /no session id recorded; only the session ttl applies/);
});

test('end-session frees an unnamed clean slot and a named, pushed, clean one', () => {
  fx = poolFixture();
  ok(fx.pool('session', 's-a'));
  assert.equal(fx.readLease(1).branch, null);
  assert.equal(ok(fx.pool('end-session', 's-a', '--json')).json().reason, 'unnamed and clean');
  assert.equal(fx.readLease(1), null);
  ok(fx.pool('session', 's-b'));
  ok(fx.pool('name', 'feat/from-session', '--slot', 'pool-01'));
  assert.equal(fx.readLease(1).branch, 'feat/from-session');
  assert.equal(fx.git(fx.slot(1), 'branch', '--show-current'), 'feat/from-session');
  fx.commit(fx.slot(1), 'f.txt', 'f\n', 'feat: f');
  fx.git(fx.slot(1), 'push', '-q', 'origin', 'feat/from-session');
  assert.equal(ok(fx.pool('end-session', 's-b', '--json')).json().reason, 'named, pushed and clean');
  assert.equal(fx.readLease(1), null);
});

test('naming a slot that is already named, or with a bad branch, is refused', () => {
  fx = poolFixture();
  ok(fx.pool('session', 's-n'));
  assert.notEqual(fx.pool('name', 'Bad_Name', '--slot', 'pool-01').code, 0);
  ok(fx.pool('name', 'feat/named', '--slot', 'pool-01'));
  assert.match(fx.pool('name', 'feat/other', '--slot', 'pool-01').err, /already named feat\/named/);
});

test('an ended session with unsaved work keeps its slot, flagged orphaned; --backup then frees it', () => {
  fx = poolFixture();
  ok(fx.pool('session', 's-d'));
  ok(fx.pool('name', 'feat/dirty-ended', '--slot', 'pool-01'));
  fx.commit(fx.slot(1), 'c.txt', 'c\n', 'feat: c'); // unpushed
  fx.write(fx.slot(1), 'wip.txt', 'w\n');
  const kept = ok(fx.pool('end-session', 's-d', '--json')).json();
  assert.equal(kept.action, 'kept');
  assert.match(kept.reason, /1 changed files and 1 unpushed commits/);
  assert.equal(slotsJson()[0].orphaned, 'owner ended');
  const freed = ok(fx.pool('end-session', 's-d', '--backup', '--json')).json();
  assert.equal(freed.action, 'freed');
  assert.ok(readFileSync(`${freed.backup}/files/wip.txt`, 'utf8'));
  assert.equal(fx.readLease(1), null);
});

test('reading owners and reaping make no gh call and no network call when the ledger is local only', () => {
  fx = poolFixture();
  claimed(1, 'feat/offline');
  ok(fx.run(['pool', 'status', '--json']));
  const calls = JSON.parse(readFileSync(`${fx.parent}/gh-state.json`, 'utf8')).calls ?? [];
  assert.equal(calls.length, 0, 'status asked gh nothing');
});
