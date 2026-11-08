// Plan step H6: stateful checks read the repository and branch a human would, and the temp exemption of `rm -rf` is not
// escaped by `..` hidden in braces or substitutions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stateCheck } from '../src/gate-state.mjs';
import { matchGated } from '../src/gate.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (cmd, args, dir) => {
  if (cmd === 'gh') return null;
  try { return git(dir, ...args); } catch { return null; }
};

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'gg-state-targets-'));
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

test('--git-dir and --work-tree choose the repository that is judged', () => withRepo(({ root, work }) => {
  const gd = path.join(work, '.git');
  assert.equal(check('git-reset-hard', `git --git-dir=${gd} --work-tree=${work} reset --hard`, root).safe, true);
  writeFileSync(path.join(work, 'a'), 'changed');
  assert.equal(check('git-reset-hard', `git --git-dir=${gd} --work-tree=${work} reset --hard`, root).safe, false);
  assert.equal(check('git-reset-hard', `git --git-dir ${gd} --work-tree ${work} reset --hard`, root).safe, false);
  assert.equal(check('git-reset-hard', `GIT_DIR=${gd} GIT_WORK_TREE=${work} git reset --hard`, root).safe, false);
}));

test('rebase --onto and -x do not shift which branch is judged', () => withRepo(({ work }) => {
  git(work, 'checkout', '-q', '-b', 'pub');
  commit(work, 'two');
  git(work, 'push', '-q', '-u', 'origin', 'pub');
  commit(work, 'three');
  const r = check('git-rebase', 'git rebase --onto master HEAD~1', work);
  assert.equal(r.safe, false, 'the current branch is published');
  assert.match(r.why, /pub/);
  git(work, 'checkout', '-q', '-b', 'mine', 'master');
  commit(work, 'four');
  assert.equal(check('git-rebase', 'git rebase --onto master HEAD~1', work).safe, true, 'unpublished current branch');
  assert.equal(check('git-rebase', 'git rebase master', work).safe, true);
  assert.equal(check('git-rebase', 'git rebase master pub', work).safe, false, 'the named branch is published');
}));

test('rebase --exec and -x always stop: they run commands nobody inspected', () => withRepo(({ work }) => {
  git(work, 'checkout', '-q', '-b', 'mine');
  commit(work, 'two');
  for (const c of ['git rebase -x "echo a b" master', 'git rebase --exec "make test" master', 'git rebase --exec=true master', 'git rebase -ix true master']) {
    const r = check('git-rebase', c, work);
    assert.equal(r.safe, false, c);
    assert.match(r.why, /exec|command/i, c);
  }
}));

test('reset --hard on a clean tree is unsafe when it drops commits that are on no remote', () => withRepo(({ work }) => {
  assert.equal(check('git-reset-hard', 'git reset --hard HEAD~0', work).safe, true);
  git(work, 'checkout', '-q', '-b', 'mine');
  commit(work, 'two');
  commit(work, 'three');
  const r = check('git-reset-hard', 'git reset --hard HEAD~1', work);
  assert.equal(r.safe, false);
  assert.match(r.why, /commit/);
  assert.equal(check('git-reset-hard', 'git reset --hard origin/master', work).safe, false);
  assert.equal(check('git-reset-hard', 'git reset --hard', work).safe, true, 'HEAD itself drops nothing');
  git(work, 'push', '-q', '-u', 'origin', 'mine');
  assert.equal(check('git-reset-hard', 'git reset --hard HEAD~1', work).safe, true, 'the commits are on a remote branch');
}));

test('the rm -rf temp exemption is not escaped by braces, substitutions or variables', () => {
  const ids = (c) => matchGated(c).map((e) => e.id);
  assert.deepEqual(ids('rm -rf /tmp/a /tmp/b'), []);
  for (const c of [
    'rm -rf /tmp/{x,../home/u/proj}',
    'rm -rf /tmp/$(echo ..)/home',
    'rm -rf /tmp/`echo ..`/home',
    'rm -rf /tmp/$HOME',
    'rm -rf /tmp/${X}',
    'rm -rf /tmp/x/../../etc',
    'rm -rf "/tmp/x"/{a,b}',
  ]) assert.ok(ids(c).includes('rm-rf'), c);
});
