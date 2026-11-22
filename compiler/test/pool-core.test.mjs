// WP2 of docs/plans/worktree-pool.md: config, state, lock, lease, acquire and release, on a throwaway origin.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';
import { withLock, lockPath, startStamp } from '../src/pool/lock.mjs';

let fx;
afterEach(() => fx?.cleanup());
const ok = (r) => { assert.equal(r.code, 0, r.err); return r; };

test('two concurrent acquires get different slots', async () => {
  fx = poolFixture({ config: { size: 4 } });
  const one = (branch) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.resolve(import.meta.dirname, '..', 'bin', 'go-getter.mjs'), 'pool', 'acquire', '--branch', branch, '--json'], {
      cwd: fx.main, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GO_GETTER_TEST_MODE: '1', GO_GETTER_POOL_CONFIG: JSON.stringify({ size: 4 }) },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
  const [a, b] = await Promise.all([one('feat/one'), one('feat/two')]);
  assert.equal(a.code, 0);
  assert.equal(b.code, 0);
  assert.notEqual(JSON.parse(a.out).slot, JSON.parse(b.out).slot);
});

test('the 11th acquire is refused at size 10, and the slots sit beside the repository', () => {
  fx = poolFixture({ config: { size: 10 } });
  for (let i = 1; i <= 10; i++) ok(fx.pool('acquire', '--branch', `feat/task-${i}`));
  const refused = fx.pool('acquire', '--branch', 'feat/task-11');
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /pool is full: 10 of 10/);
  assert.equal(readdirSync(fx.slots).filter((d) => d.startsWith('pool-')).length, 10);
  assert.equal(fx.pool('status', '--json').json().available, 0);
});

test('acquire records a lease, starts the branch on the base, and leaves git status clean', () => {
  fx = poolFixture();
  const got = ok(fx.pool('acquire', '--branch', 'feat/leased', '--json')).json();
  assert.equal(got.path, fx.slot(1));
  assert.equal(fx.git(got.path, 'branch', '--show-current'), 'feat/leased');
  const lease = fx.readLease(1);
  assert.equal(lease.version, 1);
  assert.equal(lease.state, 'held');
  assert.equal(lease.branch, 'feat/leased');
  assert.equal(lease.base, fx.git(fx.main, 'rev-parse', 'origin/main'));
  assert.equal(fx.git(fx.main, 'status', '--porcelain'), '', 'the pool directory is not in git status');
  assert.ok(existsSync(path.join(fx.main, '.go-getter', 'pool', '.gitignore')));
});

test('a session slot is unnamed; the state root is found from inside a slot', () => {
  fx = poolFixture();
  ok(fx.run(['pool', 'acquire', '--session', 's-1']));
  assert.equal(fx.readLease(1).branch, null);
  assert.equal(fx.readLease(1).session, 's-1');
  const fromSlot = fx.run(['pool', 'status', '--json'], { cwd: fx.slot(1) }).json();
  assert.equal(fromSlot.counts.claimed, 1);
  assert.ok(!existsSync(path.join(fx.slot(1), '.go-getter')), 'no state is written inside a slot');
});

test('a bad branch name is refused with the pattern', () => {
  fx = poolFixture();
  const r = fx.pool('acquire', '--branch', 'Bad_Name');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /does not match the pool's branch pattern \^\(feat\|fix/);
  assert.equal(fx.pool('status', '--json').json().counts.claimed, 0);
});

test('a crash between pending and held leaves a recoverable record, and the slot is not handed out', () => {
  fx = poolFixture({ config: { size: 2 } });
  const crashed = fx.run(['pool', 'acquire', '--branch', 'feat/crash'], { env: { GO_GETTER_POOL_CRASH: 'after-pending' } });
  assert.equal(crashed.code, 99);
  assert.ok(existsSync(path.join(path.dirname(fx.leaseFile(1)), 'pool-01.pending.json')));
  assert.equal(fx.readLease(1), null, 'no held lease');
  const st = fx.pool('status', '--json').json();
  assert.equal(st.slots[0].state, 'unmanaged');
  assert.equal(st.slots[0].reason, 'pending-lease');
  assert.match(ok(fx.pool('acquire', '--branch', 'feat/next', '--json')).json().slot, /pool-02/);
});

test('release refuses unsaved or unique work without --force', () => {
  fx = poolFixture();
  const dir = ok(fx.pool('acquire', '--branch', 'feat/work', '--json')).json().path;
  fx.write(dir, 'notes.txt', 'wip\n');
  const dirty = fx.pool('release', 'pool-01');
  assert.notEqual(dirty.code, 0);
  assert.match(dirty.err, /exists nowhere else \(1 changed files, 0 unpushed commits\)/);
  assert.ok(fx.readLease(1), 'the lease is kept');
  fx.git(dir, 'add', '-A');
  fx.git(dir, 'commit', '-qm', 'feat: work');
  const unpushed = fx.pool('release', 'pool-01');
  assert.notEqual(unpushed.code, 0);
  assert.match(unpushed.err, /0 changed files, 1 unpushed commits/);
  fx.git(dir, 'push', '-q', 'origin', 'feat/work');
  ok(fx.pool('release', 'pool-01'));
  assert.equal(fx.readLease(1), null);
  assert.equal(fx.git(dir, 'branch', '--show-current'), '', 'the slot is detached again');
  assert.equal(fx.pool('status', '--json').json().slots[0].state, 'free');
  assert.match(fx.git(fx.main, 'ls-remote', '--heads', 'origin', 'feat/work'), /refs\/heads\/feat\/work/, 'the pushed work is on the remote');
  assert.match(fx.git(fx.main, 'branch', '--list', 'feat/work'), /feat\/work/, 'release returns the slot and leaves the branch alone');
  const again = ok(fx.pool('acquire', '--branch', 'feat/work', '--json')).json();
  assert.equal(fx.git(again.path, 'branch', '--show-current'), 'feat/work', 'a branch left behind by a released slot is resumed');
  assert.notEqual(fx.pool('acquire', '--branch', 'feat/work').code, 0, 'a branch a slot holds is still refused');
});

test('release --backup writes the files and a patch bundle before forcing', () => {
  fx = poolFixture();
  const dir = ok(fx.pool('acquire', '--branch', 'feat/precious', '--json')).json().path;
  fx.commit(dir, 'kept.txt', 'committed\n', 'feat: kept');
  fx.write(dir, 'README.md', 'edited\n');
  fx.write(dir, 'scratch/new.sh', 'echo hi\n');
  const done = ok(fx.pool('release', 'pool-01', '--backup', '--json')).json();
  assert.ok(done.backup.startsWith(path.join(fx.main, '.go-getter', 'pool', 'backup')));
  assert.equal(readFileSync(path.join(done.backup, 'files', 'scratch', 'new.sh'), 'utf8'), 'echo hi\n');
  assert.match(readFileSync(path.join(done.backup, 'work.patch'), 'utf8'), /\+edited/);
  assert.equal(readFileSync(path.join(done.backup, 'files', 'README.md'), 'utf8'), 'edited\n', 'a tracked change is copied under its full path');
  assert.ok(existsSync(path.join(done.backup, 'commits.bundle')));
  assert.equal(fx.readLease(1), null);
  assert.equal(fx.git(dir, 'status', '--porcelain'), '');
  assert.equal(existsSync(path.join(dir, 'scratch')), false);
});

test('a lock whose owner died is taken over at once, and a live holder is waited for', () => {
  fx = poolFixture();
  const lock = lockPath(fx.main);
  mkdirSync(lock);
  writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: 2 ** 22 - 1, start: '1' }));
  const t0 = Date.now();
  assert.equal(withLock(fx.main, () => 'ran', { waitMs: 3000 }), 'ran');
  assert.ok(Date.now() - t0 < 1000, 'no waiting on a dead owner');
  mkdirSync(lock);
  writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: process.pid, start: startStamp(process.pid) }));
  assert.throws(() => withLock(fx.main, () => 'no', { waitMs: 200 }), /holds the lock/);
});
