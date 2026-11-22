import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';

let fx;
afterEach(() => fx?.cleanup());

test('adopt: a detached slot with its own commits needs a name, then becomes a claimed slot', () => {
  fx = poolFixture();
  const dir = fx.freeSlot(1);
  fx.commit(dir, 'work.txt', 'w\n', 'feat: work');
  const refused = fx.pool('adopt', 'pool-01');
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /--branch/);
  assert.equal(fx.pool('adopt', 'pool-01', '--branch', 'feat/adopted').code, 0);
  assert.equal(fx.readLease(1).branch, 'feat/adopted');
  const st = fx.pool('status', '--json').json();
  assert.equal(st.slots[0].state, 'claimed');
});

test('adopt: a clean detached slot is freed, a worktree outside the pool moves into a cold slot', () => {
  fx = poolFixture();
  fx.freeSlot(1);
  assert.match(fx.pool('adopt', 'pool-01').out, /freed/);
  const other = path.join(fx.slots, 'elsewhere');
  fx.git(fx.main, 'worktree', 'add', '-q', '-b', 'fix/elsewhere', other, 'origin/main');
  fx.commit(other, 'e.txt', 'e\n', 'fix: e');
  const r = fx.pool('adopt', other);
  assert.equal(r.code, 0, r.err);
  assert.ok(!existsSync(other));
  assert.equal(fx.pool('status', '--json').json().outside.length, 0);
});

test('remove: refuses the main checkout and pool slots, saves dirty files with --backup', () => {
  fx = poolFixture();
  assert.notEqual(fx.pool('remove', fx.main).code, 0);
  fx.freeSlot(1);
  assert.match(fx.pool('remove', fx.slot(1)).err, /pool release/);
  const w = path.join(fx.slots, 'dirty-one');
  fx.git(fx.main, 'worktree', 'add', '-q', '-b', 'fix/dirty-one', w, 'origin/main');
  fx.write(w, 'notes.txt', 'keep me\n');
  assert.notEqual(fx.pool('remove', w).code, 0);
  assert.equal(fx.pool('remove', w, '--backup').code, 0);
  assert.ok(!existsSync(w));
  const backups = readdirSync(path.join(fx.main, '.go-getter', 'pool', 'backup'));
  assert.equal(backups.length, 1);
  assert.ok(existsSync(path.join(fx.main, '.go-getter', 'pool', 'backup', backups[0], 'files', 'notes.txt')));
});

test('doctor: moves a non-worktree directory aside, never deletes, and is idempotent', () => {
  fx = poolFixture();
  mkdirSync(fx.slot(2), { recursive: true });
  writeFileSync(path.join(fx.slot(2), 'precious.txt'), 'data\n');
  const dry = fx.pool('doctor', '--dry-run', '--json').json();
  assert.equal(dry[0].action, 'move-aside');
  assert.ok(existsSync(fx.slot(2)), 'dry run changes nothing');
  assert.equal(fx.pool('doctor').code, 0);
  const moved = readdirSync(fx.slots).find((n) => n.startsWith('orphan-02-'));
  assert.ok(moved);
  assert.ok(existsSync(path.join(fx.slots, moved, 'precious.txt')));
  assert.match(fx.pool('doctor').out, /nothing to do/);
});

test('doctor: drops a lease that points at nothing and finishes or drops pending claims', () => {
  fx = poolFixture();
  fx.writeLease(3, { branch: 'feat/vanished' });
  const r = fx.pool('doctor', '--json').json();
  assert.ok(r.some((x) => x.action === 'drop-lease' && x.slot === 'pool-03'));
  assert.equal(fx.readLease(3), null);
  // a crash between pending and held leaves a record the doctor finishes
  const crashed = fx.run(['pool', 'acquire', '--branch', 'feat/crashy'], { env: { GO_GETTER_POOL_CRASH: 'after-pending' } });
  assert.equal(crashed.code, 99);
  const fix = fx.pool('doctor', '--json').json();
  assert.ok(fix.some((x) => x.action === 'finish-claim'));
  assert.equal(fx.readLease(1).branch, 'feat/crashy');
  assert.match(fx.pool('doctor').out, /nothing to do/);
});
