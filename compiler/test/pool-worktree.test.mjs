// WP7: with the pool on, `worktree new|list|clean` are `acquire`, a slot list and `reap`; off, the other worktree tests run unchanged.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

// The on/off table: `plan start --worktree` behaves the same with the pool on and off (a worktree, the marker set in its copy of the plan).
for (const mode of ['on', 'off']) {
  test(`plan start --worktree makes a worktree and marks the step in its copy (pool ${mode})`, () => {
    fx = poolFixture({ config: { size: 2, warm: 0 } });
    fx.commit(fx.main, 'docs/plans/p.md', '# P\n\n## Phase 1\n\n### 1 First — [ ]\nClass: implement · Needs: none · Check: `true`\nDone-when: done.\n', 'docs: plan');
    fx.git(fx.main, 'push', '-q', 'origin', fx.base);
    const env = mode === 'off' ? { GO_GETTER_POOL_CONFIG: '' } : {};
    const r = fx.run(['plan', 'start', '1', 'docs/plans/p.md', '--worktree', 'first'], { env });
    assert.equal(r.code, 0, r.err);
    const made = r.out.split('\n')[0].replace(/ \(.*\)$/, '');
    assert.match(readFileSync(path.join(made, 'docs/plans/p.md'), 'utf8'), /### 1 First — \[~\]/);
    if (mode === 'on') assert.match(made, /pool-01$/);
    else assert.doesNotMatch(path.basename(made), /^pool-/);
  });
}
