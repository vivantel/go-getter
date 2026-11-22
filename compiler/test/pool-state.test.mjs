// WP3 of docs/plans/worktree-pool.md: slot states, the free definition, warm slots and the one available figure.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';
import { isScratch } from '../src/pool/state.mjs';

let fx;
afterEach(() => fx?.cleanup());
const slot1 = () => fx.pool('status', '--json').json().slots[0];

test('scratch patterns match a directory, a glob or an exact path, never a neighbour', () => {
  assert.ok(isScratch('dist/a/b.js', ['dist/']));
  assert.ok(isScratch('dist', ['dist']));
  assert.ok(isScratch('build/x.o', ['build/*']));
  assert.ok(isScratch('a/b/out.log', ['**/*.log']));
  assert.ok(!isScratch('distant/x', ['dist/']));
  assert.ok(!isScratch('src/new.js', ['dist/', 'build/']));
  assert.ok(!isScratch('x', ['']));
});

test('an ignored file keeps a slot free', () => {
  fx = poolFixture();
  const dir = fx.freeSlot(1);
  fx.write(dir, 'node_modules/pkg/index.js');
  assert.equal(slot1().state, 'free');
});

test('an untracked source file keeps a slot unmanaged, with its path in the reason', () => {
  fx = poolFixture({ config: { scratch: ['dist/'] } });
  const dir = fx.freeSlot(1);
  fx.write(dir, 'dist/out.js');
  fx.write(dir, 'src/important.js', 'work\n');
  const s = slot1();
  assert.equal(s.state, 'unmanaged');
  assert.equal(s.reason, 'untracked-unknown');
  assert.deepEqual(s.files, ['src/important.js']);
  assert.ok(existsSync(path.join(dir, 'src/important.js')), 'nothing was freed or deleted');
  assert.match(fx.pool('status').out, /src\/important\.js/);
});

test('a tracked change, or a commit with no lease, is unmanaged with its own reason', () => {
  fx = poolFixture({ config: { size: 2 } });
  const a = fx.freeSlot(1);
  fx.write(a, 'README.md', 'edited\n');
  const b = fx.freeSlot(2);
  fx.commit(b, 'x.txt', 'x\n', 'feat: x');
  const st = fx.pool('status', '--json').json().slots;
  assert.equal(st[0].reason, 'dirty-tracked');
  assert.equal(st[1].reason, 'no-lease-has-commits');
});

test('a free slot behind the base is still free; counts and available add up', () => {
  fx = poolFixture({ config: { size: 4 } });
  fx.freeSlot(1);
  const other = fx.freeSlot(2);
  fx.git(other, 'switch', '-q', '-c', 'feat/held');
  fx.writeLease(3, { branch: 'feat/other' });
  fx.commit(fx.main, 'later.txt', 'later\n', 'feat: later');
  fx.git(fx.main, 'push', '-q', 'origin', 'main');
  const st = fx.pool('status', '--json').json();
  assert.deepEqual(st.counts, { cold: 1, free: 1, claimed: 1, unmanaged: 1 });
  assert.equal(st.available, 2);
});

test('warm creates warm slots once per create, refreshes them on a new base, and never makes a slot cold', () => {
  fx = poolFixture({ config: { size: 4, warm: 2, warmCommand: 'echo "$PWD" >> ../warm-ran.log' } });
  const log = path.join(fx.slots, 'warm-ran.log');
  const count = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0);
  const first = fx.pool('warm', '--sync');
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /created 2, refreshed 0/);
  assert.equal(count(), 2);
  assert.equal(fx.pool('status', '--json').json().counts.free, 2);
  fx.pool('warm', '--sync');
  assert.equal(count(), 2, 'the warm command does not run again when nothing changed');
  fx.pool('acquire', '--branch', 'feat/take');
  assert.equal(count(), 2, 'acquire does not run it');
  fx.pool('warm', '--sync');
  assert.equal(count(), 3, 'one slot was claimed, so one new warm slot is made');
  fx.commit(fx.main, 'newer.txt', 'n\n', 'feat: newer');
  fx.git(fx.main, 'push', '-q', 'origin', 'main');
  const refreshed = fx.pool('warm', '--sync');
  assert.match(refreshed.out, /refreshed 2/);
  assert.equal(count(), 5);
  const st = fx.pool('status', '--json').json();
  assert.equal(st.counts.cold, 1, 'warming never turned a slot cold');
  assert.equal(st.available, 3);
});

test('a failing warm command is reported and does not stop the pool', () => {
  fx = poolFixture({ config: { size: 2, warm: 1, warmCommand: 'exit 3' } });
  const r = fx.pool('warm', '--sync');
  assert.equal(r.code, 0);
  assert.match(r.err, /warm command failed in pool-01/);
  assert.equal(fx.pool('status', '--json').json().counts.free, 1);
});
