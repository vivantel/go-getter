// WP7: with the pool on, `worktree new|list|clean` are `acquire`, a slot list and `reap`; off, the other worktree tests run unchanged.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { poolFixture } from './helpers/pool-fixture.mjs';

let fx;
afterEach(() => fx?.cleanup());
const wt = (...a) => fx.run(['worktree', ...a]);

test('worktree new acquires a slot, returns it again for the same branch, and records the slug', () => {
  fx = poolFixture({ config: { size: 2, warm: 0 } });
  const first = wt('new', 'fix-bug', '--branch', 'fix/bug');
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /pool-01/);
  assert.equal(fx.readLease(1).description, 'fix-bug');
  const again = wt('new', 'fix-bug', '--branch', 'fix/bug');
  assert.match(again.out, /already exists/);
  assert.equal(fx.readLease(2), null);
  assert.match(wt('list').out, /pool-01\tclaimed\tfix\/bug\tfix-bug/);
  assert.match(wt('list').out, /pool-02\tcold/);
});

test('worktree new refuses at the pool size with the limit message, and clean plans through reap', () => {
  fx = poolFixture({ config: { size: 1, warm: 0, claimGraceSeconds: 0, sessionTtlSeconds: 0 } });
  assert.equal(wt('new', 'one').code, 0);
  const full = wt('new', 'two');
  assert.notEqual(full.code, 0);
  assert.match(full.err, /pool is full/);
  assert.match(wt('clean', '--dry-run').out, /pool-01/);
});
