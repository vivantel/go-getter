// Roadmap G1 (decision 0159): state-dependent commands run when safe and stop when not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stateCheck } from '../src/gate-state.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const noGh = (cmd, args, dir) => (cmd === 'gh' ? null : execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'] }).trim());
const run = (cmd, args, dir) => { try { return noGh(cmd, args, dir); } catch { return null; } };

// A clone `work` of a bare `origin` with master pushed.
function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'gg-state-'));
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  mkdirSync(work);
  git(root, 'init', '-q', '--bare', '-b', 'master', origin);
  git(work, 'init', '-q', '-b', 'master');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false']]) git(work, 'config', k, v);
  git(work, 'remote', 'add', 'origin', origin);
  writeFileSync(path.join(work, 'a'), '1');
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'one');
  git(work, 'push', '-q', '-u', 'origin', 'master');
  git(work, 'remote', 'set-head', 'origin', 'master');
  return { root, work };
}
const commit = (work, msg) => { writeFileSync(path.join(work, msg), msg); git(work, 'add', '.'); git(work, 'commit', '-qm', msg); };
const withRepo = (fn) => { const r = repo(); try { return fn(r); } finally { rmSync(r.root, { recursive: true, force: true }); } };
const check = (id, command, cwd) => stateCheck(id, command, cwd, run);

test('git branch -D: safe when the tip is on a remote branch or the default branch, unsafe with unpushed commits', () => withRepo(({ work }) => {
  git(work, 'branch', 'merged');
  assert.equal(check('git-branch-delete', 'git branch -D merged', work).safe, true);
  git(work, 'checkout', '-q', '-b', 'pushed');
  commit(work, 'two');
  git(work, 'push', '-q', '-u', 'origin', 'pushed');
  git(work, 'checkout', '-q', 'master');
  assert.equal(check('git-branch-delete', 'git branch -D pushed', work).safe, true);
  git(work, 'checkout', '-q', '-b', 'local');
  commit(work, 'three');
  git(work, 'checkout', '-q', 'master');
  const r = check('git-branch-delete', 'git branch -D local', work);
  assert.equal(r.safe, false);
  assert.match(r.why, /branch local/);
  assert.equal(check('git-branch-delete', 'git branch -D merged local', work).safe, false);
  assert.equal(check('git-branch-delete', 'git branch -D nothere', work).safe, true);
}));

test('git reset --hard: safe on a clean tree, unsafe with uncommitted changes', () => withRepo(({ work }) => {
  assert.equal(check('git-reset-hard', 'git reset --hard origin/master', work).safe, true);
  writeFileSync(path.join(work, 'a'), 'changed');
  assert.equal(check('git-reset-hard', 'git reset --hard', work).safe, false);
  assert.equal(check('git-reset-hard', `git -C ${work} reset --hard`, path.dirname(work)).safe, false);
}));

test('git rebase: safe on a branch with no remote counterpart, unsafe on a published one', () => withRepo(({ work }) => {
  git(work, 'checkout', '-q', '-b', 'topic');
  commit(work, 'two');
  assert.equal(check('git-rebase', 'git rebase master', work).safe, true);
  git(work, 'push', '-q', '-u', 'origin', 'topic');
  const r = check('git-rebase', 'git rebase master', work);
  assert.equal(r.safe, false);
  assert.match(r.why, /published/);
  assert.equal(check('git-rebase', 'git rebase master topic', work).safe, false);
  assert.equal(check('git-rebase', 'git rebase --abort', work).safe, true);
}));

test('removing a worktree: safe when clean, unsafe with uncommitted or untracked files', () => withRepo(({ root, work }) => {
  const wt = path.join(root, 'wt');
  git(work, 'worktree', 'add', '-q', wt, '-b', 'side');
  assert.equal(check('git-worktree-remove', `git worktree remove ${wt}`, work).safe, true);
  writeFileSync(path.join(wt, 'new'), 'x');
  assert.equal(check('git-worktree-remove', `git worktree remove --force ${wt}`, work).safe, false);
}));

test('a command the check cannot read is unsafe', () => {
  assert.equal(stateCheck('git-reset-hard', 'sh -c "git reset --hard"', tmpdir(), run).safe, false);
  assert.equal(stateCheck('git-reset-hard', 'git reset --hard', path.join(tmpdir(), 'no-such-dir-gg'), run).safe, false);
});
