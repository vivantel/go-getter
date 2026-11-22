// The nine failures measured on termenbox's shell pool on 2026-11-21 (fact draft-wp-termenbox-pool-failure-modes), one case each,
// on a throwaway origin. Each case is `todo` with the plan step that makes it pass (docs/plans/worktree-pool.md); that step removes its
// own `todo` marker. A todo case still runs and reports its failure, so the red record stays in this file while CI stays green.
//
// Output shapes the cases rely on (the pool steps implement them):
//   pool status --json -> { available, counts: {cold, free, claimed, unmanaged}, slots: [{slot, state, reason?, branch?, owner?, merged?}],
//                           outside: [{path, branch, dirty}], stashes: [{message, slot?}] }
//   pool reap, pool release <slot> [--backup], pool remove <path> [--force|--backup], pool doctor.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';

let fx;
afterEach(() => fx?.cleanup());
const pending = (wp, name, fn) => test(`failure ${name}`, { todo: wp }, fn);
const status = () => {
  const r = fx.pool('status', '--json');
  assert.equal(r.code, 0, r.err);
  return r.json();
};
const slotState = (st, n) => st.slots.find((s) => s.slot === `pool-${String(n).padStart(2, '0')}`)?.state;
// A claimed slot on `branch` with one commit, pushed to origin, with its lease written as `acquire` would.
function claimed(n, branch, file = 'feature.txt') {
  const dir = fx.freeSlot(n);
  fx.git(dir, 'switch', '-qc', branch);
  fx.commit(dir, file, `${branch}\n`, `feat: ${branch}`);
  fx.git(dir, 'push', '-q', 'origin', branch);
  fx.writeLease(n, { branch });
  return dir;
}

test('failure 1: an untracked build directory listed as scratch does not make a free slot unmanaged', () => {
  fx = poolFixture({ config: { scratch: ['dist/'] } });
  const dir = fx.freeSlot(1);
  fx.write(dir, 'dist/out.js');
  assert.equal(slotState(status(), 1), 'free');
});

pending('WP4', '2: a squash-merged branch and a closed-but-landed pull request are reaped', () => {
  fx = poolFixture();
  claimed(1, 'feat/squashed');
  const b = claimed(2, 'feat/closed-landed', 'landed.txt');
  fx.squashOntoBase('feat/squashed');
  fx.squashOntoBase('feat/closed-landed');
  fx.git(b, 'push', '-q', 'origin', '--delete', 'feat/closed-landed');
  fx.setPrs([{ number: 1, head: 'feat/closed-landed', state: 'CLOSED', mergedAt: null }]);
  assert.equal(fx.pool('reap', '--sync').code, 0);
  const st = status();
  for (const n of [1, 2]) assert.ok(['free', 'cold'].includes(slotState(st, n)), `pool-0${n} is ${slotState(st, n)}`);
  assert.equal(fx.readLease(1), null);
  assert.equal(fx.readLease(2), null);
});

pending('WP4', '3: a dirty slot whose branch is merged is archived to a backup, then freed', () => {
  fx = poolFixture();
  const dir = claimed(1, 'fix/merged-but-dirty');
  fx.git(dir, 'push', '-q', 'origin', 'HEAD:main');
  fx.write(dir, 'scratch/.h-run.sh', 'echo hi\n');
  assert.equal(fx.pool('reap', '--sync').code, 0);
  assert.equal(fx.readLease(1), null);
  const backup = path.join(fx.main, '.go-getter', 'pool', 'backup');
  assert.ok(existsSync(backup) && readdirSync(backup, { recursive: true }).some((f) => String(f).endsWith('.h-run.sh')), 'the untracked file is in the backup');
});

pending('WP4', '4: a lease whose branch ref is gone and whose commits are in the base is freed', () => {
  fx = poolFixture();
  const dir = claimed(1, 'chore/pr-sweep');
  fx.git(dir, 'push', '-q', 'origin', 'HEAD:main');
  fx.git(dir, 'switch', '-q', '--detach', 'origin/main');
  fx.git(fx.main, 'branch', '-D', 'chore/pr-sweep');
  fx.git(fx.main, 'push', '-q', 'origin', '--delete', 'chore/pr-sweep');
  assert.equal(fx.pool('reap', '--sync').code, 0);
  assert.equal(fx.readLease(1), null);
});

pending('WP5', '5: a pushed, clean slot whose owner has ended is shown lapsed and freed after the grace', () => {
  fx = poolFixture();
  claimed(1, 'feat/owner-gone');
  fx.writeLease(1, { branch: 'feat/owner-gone', session: 's-ended', worker: 'w-ended' });
  const late = { GO_GETTER_CLOCK_OFFSET_MS: String(48 * 3600e3) };
  const st = fx.run(['pool', 'status', '--json'], { env: late }).json();
  assert.equal(st.slots.find((s) => s.slot === 'pool-01').owner?.state, 'lapsed');
  assert.equal(fx.run(['pool', 'reap', '--sync'], { env: late }).code, 0);
  assert.equal(fx.readLease(1), null);
});

pending('WP6', '6: worktrees outside the pool are listed with their state', () => {
  fx = poolFixture();
  fx.git(fx.main, 'worktree', 'add', '-q', '-b', 'fix/ci-flakes', path.join(fx.slots, 'ci-flakes'), 'origin/main');
  const outside = status().outside ?? [];
  const found = outside.find((o) => o.path.endsWith('ci-flakes'));
  assert.ok(found, 'ci-flakes is listed');
  assert.equal(found.branch, 'fix/ci-flakes');
});

pending('WP6', '7: a worktree outside the pool is removed by a verb, and one with unique commits is refused without --force', () => {
  fx = poolFixture();
  const clean = path.join(fx.slots, 'clean-one');
  const unique = path.join(fx.slots, 'unique-one');
  fx.git(fx.main, 'worktree', 'add', '-q', '-b', 'fix/clean-one', clean, 'origin/main');
  fx.git(fx.main, 'worktree', 'add', '-q', '-b', 'fix/unique-one', unique, 'origin/main');
  fx.commit(unique, 'only-here.txt', 'x\n', 'feat: only here');
  assert.equal(fx.pool('remove', clean).code, 0);
  assert.ok(!existsSync(clean));
  const refused = fx.pool('remove', unique);
  assert.notEqual(refused.code, 0);
  assert.ok(existsSync(unique), 'the worktree with unique commits is still there');
});

test('failure 8: releasing slots shows one available figure that counts cold slots', () => {
  fx = poolFixture({ config: { size: 5, warm: 0 } });
  const names = ['feat/a-one', 'feat/b-two', 'feat/c-three'];
  for (const b of names) assert.equal(fx.pool('acquire', '--branch', b).code, 0);
  assert.equal(status().available, 2);
  for (let n = 1; n <= 3; n++) assert.equal(fx.pool('release', `pool-0${n}`, '--force').code, 0);
  assert.equal(status().available, 5);
});

pending('WP6', '9: stashes are listed in status, tied to a slot when the message names its branch, and never dropped', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/has-stash');
  fx.write(dir, 'wip.txt', 'wip\n');
  fx.git(dir, 'stash', 'push', '-u', '-m', 'WIP on feat/has-stash');
  const st = status();
  const found = (st.stashes ?? []).find((s) => s.message.includes('feat/has-stash'));
  assert.ok(found, 'the stash is listed');
  assert.equal(found.slot, 'pool-01');
  fx.pool('release', 'pool-01', '--force');
  assert.match(fx.git(fx.main, 'stash', 'list'), /feat\/has-stash/, 'release never drops a stash');
});
