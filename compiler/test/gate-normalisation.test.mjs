// Plan step H5: a command word is reduced to what runs before it is matched (decision 0094). Each spelling must be gated
// exactly as the plain spelling is; text that merely mentions a command must not be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGated } from '../src/gate.mjs';

const ids = (command) => matchGated(command).map((e) => e.id);

// [spelling, plain spelling it must be judged like]
const SPELLINGS = [
  ['/usr/bin/git push --force', 'git push --force'],
  ['command git push', 'git push'],
  ['nohup git reset --hard', 'git reset --hard'],
  ['timeout 9 git rebase main', 'git rebase main'],
  ["git 'push' -f", 'git push -f'],
  ['git "push" origin main', 'git push origin main'],
  ['g\\it push', 'git push'],
  ['git --work-tree . reset --hard', 'git reset --hard'],
  ['git --git-dir .g --work-tree . push --force', 'git push --force'],
  ['git --namespace ns push', 'git push'],
  ['git -c user.name=x -C app push -f', 'git push -f'],
  ['git --git-dir=.g push', 'git push'],
  ['time git push', 'git push'],
  ['nice -n 5 git push', 'git push'],
  ['exec git push', 'git push'],
  ['env FOO=1 git push', 'git push'],
  ['sudo -u deploy /usr/bin/git push', 'git push'],
  ['doas git push', 'git push'],
  ['echo x | xargs git push', 'git push'],
  ['xargs -n1 git push', 'git push'],
  ['nohup nice -n 5 time git push --force', 'git push --force'],
  ['timeout -s KILL 9 git push', 'git push'],
  ['/bin/rm -rf build', 'rm -rf build'],
  ['\\rm -rf build', 'rm -rf build'],
  ["'rm' -rf build", 'rm -rf build'],
  ['/usr/bin/gh pr merge 5', 'gh pr merge 5'],
  ["gh 'pr' merge 5", 'gh pr merge 5'],
  ['command gh -R o/r pr merge 5', 'gh -R o/r pr merge 5'],
  ['/usr/bin/npm publish', 'npm publish'],
  ['sh -c "git push"', 'git push'],
  ["bash -lc 'git push --force'", 'git push --force'],
];

for (const [spelling, plain] of SPELLINGS) {
  test(`gated as ${plain}: ${spelling}`, () => {
    const want = ids(plain);
    assert.ok(want.length, `the plain spelling must be gated: ${plain}`);
    assert.deepEqual(ids(spelling), want);
  });
}

test('an unparseable command naming a gated tool matches the strictest candidate', () => {
  assert.ok(ids('git push "origin').length > 0);
  assert.ok(ids('git -C').length > 0);
  assert.ok(ids("rm -rf 'build").includes('rm-rf'));
});

test('text that only mentions a command is not gated', () => {
  for (const c of [
    'echo git push',
    'grep -r "git push" .',
    'git-lfs pull',
    'echo /usr/bin/git push --force',
    'git status',
    'git --work-tree . status',
    'git -C app log',
    'nohup make',
    'timeout 9 make test',
    'sudo apt install git',
    'sh -c "echo hi"',
    'sh script.sh',
    'man git',
    'ls -la /usr/bin/git',
    'echo "unterminated',
    'time ls',
    'xargs echo',
  ]) assert.deepEqual(ids(c), [], c);
});
