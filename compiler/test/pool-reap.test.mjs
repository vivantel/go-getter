// WP4 of docs/plans/worktree-pool.md: merged-ness and reap. Work is never freed on a guess.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';

let fx;
afterEach(() => fx?.cleanup());
const reap = (...a) => {
  const r = fx.pool('reap', '--sync', '--json', ...a);
  assert.equal(r.code, 0, r.err);
  return r.json();
};
const by = (results, n) => results.find((r) => r.slot === `pool-0${n}`);
function claimed(n, branch, file = `${branch.replace('/', '-')}.txt`) {
  const dir = fx.freeSlot(n);
  fx.git(dir, 'switch', '-qc', branch);
  fx.commit(dir, file, `${branch}\n`, `feat: ${branch}`);
  fx.git(dir, 'push', '-q', 'origin', branch);
  fx.writeLease(n, { branch });
  return dir;
}
// The base moves on with a change that is not the branch's patch, as an edited squash does.
function landSomethingElse() {
  fx.commit(fx.main, 'other.txt', 'other\n', 'feat: other');
  fx.git(fx.main, 'push', '-q', 'origin', 'main');
}

test('a slot with an open pull request is never freed, and the reason names it', () => {
  fx = poolFixture();
  claimed(1, 'feat/open');
  fx.setPrs([{ number: 7, head: 'feat/open', state: 'OPEN' }]);
  const r = by(reap(), 1);
  assert.equal(r.action, 'keep');
  assert.equal(r.keep, 'open-pr');
  assert.ok(fx.readLease(1));
});

test('a pull request closed without merging keeps its slot, even when its remote branch is deleted', () => {
  fx = poolFixture();
  claimed(1, 'feat/abandoned');
  fx.git(fx.main, 'push', '-q', 'origin', '--delete', 'feat/abandoned');
  fx.setPrs([{ number: 9, head: 'feat/abandoned', state: 'CLOSED', mergedAt: null }]);
  const r = by(reap(), 1);
  assert.equal(r.keep, 'closed-unmerged');
  assert.match(r.reason, /#9 was closed without merging/);
  assert.ok(fx.readLease(1), 'the lease and its slot stay');
});

test('a merged pull request with the same head frees the slot even when its patch is not in the base', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/edited-squash');
  const tip = fx.git(dir, 'rev-parse', 'HEAD');
  landSomethingElse();
  fx.setPrs([{ number: 3, head: 'feat/edited-squash', state: 'MERGED', headRefOid: tip, mergedAt: '2026-11-21T00:00:00Z' }]);
  const r = by(reap(), 1);
  assert.equal(r.action, 'freed');
  assert.equal(r.reason, 'pull request merged');
  assert.equal(fx.readLease(1), null);
});

test('a merged slot with unpushed commits and dirty files is freed only with both in the backup', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/merged-dirty');
  fx.git(dir, 'push', '-q', 'origin', 'HEAD:main');
  fx.write(dir, 'notes/todo.txt', 'later\n');
  const r = by(reap(), 1);
  assert.equal(r.action, 'freed');
  assert.equal(r.saved.files, 1);
  assert.equal(fx.git(fx.main, 'branch', '--list', 'feat/merged-dirty'), '', 'reap deletes a branch it proved merged');
  assert.ok(existsSync(path.join(r.backup, 'files', 'notes', 'todo.txt')));
  assert.equal(fx.readLease(1), null);
});

test('squash-merged work whose local commits exist nowhere else is bundled before the slot is freed', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/squashed-local');
  fx.squashOntoBase('feat/squashed-local');
  fx.git(fx.main, 'push', '-q', 'origin', '--delete', 'feat/squashed-local');
  const r = by(reap(), 1);
  assert.equal(r.action, 'freed');
  assert.equal(r.saved.commits, 1);
  assert.ok(existsSync(path.join(r.backup, 'commits.bundle')), 'nothing is lost');
  assert.equal(fx.git(dir, 'branch', '--show-current'), '');
});

test('a young claim is kept, and a branch at its creation commit waits for the session ttl', () => {
  fx = poolFixture({ config: { claimGraceSeconds: 600, sessionTtlSeconds: 43200 } });
  const young = claimed(1, 'feat/young');
  fx.write(young, 'wip.txt', 'unsaved\n');
  fx.writeLease(1, { branch: 'feat/young', claimedAt: new Date().toISOString() });
  const idle = fx.freeSlot(2);
  fx.git(idle, 'switch', '-qc', 'feat/idle');
  fx.writeLease(2, { branch: 'feat/idle' });
  const first = reap();
  assert.equal(by(first, 1).keep, 'young');
  assert.equal(by(first, 2).keep, 'idle');
  const later = fx.run(['pool', 'reap', '--sync', '--json'], { env: { GO_GETTER_CLOCK_OFFSET_MS: String(13 * 3600e3) } }).json();
  assert.equal(by(later, 2).action, 'freed');
  assert.equal(by(later, 1).action, 'keep', 'unsaved work is never freed by time alone');
  assert.equal(by(later, 1).keep, 'orphaned');
});

test('--dry-run changes nothing, and an unnamed session slot is left to end-session', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/will-merge');
  fx.git(dir, 'push', '-q', 'origin', 'HEAD:main');
  fx.freeSlot(2);
  fx.writeLease(2, { branch: null, session: 's-1' });
  const results = reap('--dry-run');
  assert.equal(by(results, 1).action, 'would-free');
  assert.equal(by(results, 2).keep, 'session');
  assert.ok(fx.readLease(1), 'dry run left the lease');
  assert.equal(fx.git(dir, 'branch', '--show-current'), 'feat/will-merge');
});

test('reap without --sync returns at once and writes a log', async () => {
  fx = poolFixture();
  const r = fx.pool('reap');
  assert.equal(r.code, 0);
  assert.match(r.out, /started in the background/);
  assert.ok(existsSync(path.join(fx.main, '.go-getter', 'pool', 'reap.log')));
  await new Promise((resolve) => setTimeout(resolve, 1500)); // let the detached run finish before the fixture is removed
  assert.ok(readdirSync(path.join(fx.main, '.go-getter', 'pool')).includes('reap.log'));
});

test('with gh unavailable, a deleted remote branch alone does not free a slot whose patch is not in the base', () => {
  fx = poolFixture();
  const dir = claimed(1, 'feat/maybe-abandoned');
  fx.git(dir, 'branch', '--set-upstream-to=origin/feat/maybe-abandoned');
  fx.git(fx.main, 'push', '-q', 'origin', '--delete', 'feat/maybe-abandoned');
  const r = by(JSON.parse(fx.run(['pool', 'reap', '--sync', '--json'], { env: { GH_FAKE_FAIL: '1' } }).out), 1);
  assert.equal(r.action, 'keep');
  assert.equal(r.keep, 'unknown-pr');
  assert.ok(fx.readLease(1));
  assert.equal(by(reap(), 1).action, 'freed', 'once gh answers and no pull request is closed-unmerged or open, it is freed');
});

test('a pushed branch with an open pull request frees its slot only after the owner has been gone for the pushed-free delay', () => {
  fx = poolFixture({ config: { claimGraceSeconds: 600, pushedFreeSeconds: 86400 } });
  claimed(1, 'feat/pushed-open');
  fx.setPrs([{ number: 11, head: 'feat/pushed-open', state: 'OPEN' }]);
  const soon = fx.run(['pool', 'reap', '--sync', '--json'], { env: { GO_GETTER_CLOCK_OFFSET_MS: String(2 * 3600e3) } }).json();
  assert.equal(by(soon, 1).keep, 'open-pr', 'before the delay the slot stays');
  const later = fx.run(['pool', 'reap', '--sync', '--json'], { env: { GO_GETTER_CLOCK_OFFSET_MS: String(25 * 3600e3) } }).json();
  assert.equal(by(later, 1).action, 'freed');
  assert.match(by(later, 1).reason, /pull request #11 is open/);
  assert.equal(fx.git(fx.main, 'branch', '--list', 'feat/pushed-open').includes('feat/pushed-open'), true, 'the branch stays');
});

test('an open pull request keeps its slot past the delay when the work is not pushed', () => {
  fx = poolFixture({ config: { claimGraceSeconds: 600, pushedFreeSeconds: 86400 } });
  const dir = claimed(1, 'feat/unpushed-open');
  fx.write(dir, 'wip.txt', 'unsaved\n');
  fx.setPrs([{ number: 12, head: 'feat/unpushed-open', state: 'OPEN' }]);
  const later = fx.run(['pool', 'reap', '--sync', '--json'], { env: { GO_GETTER_CLOCK_OFFSET_MS: String(25 * 3600e3) } }).json();
  assert.equal(by(later, 1).action, 'keep');
});
