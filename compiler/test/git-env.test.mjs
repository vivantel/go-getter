import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanGitEnv } from '../src/git-env.mjs';

test('child processes never inherit the hooked repository from a git hook', () => {
  const env = cleanGitEnv({ PATH: '/bin', GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/.git/index', GIT_SSH_COMMAND: 'ssh -i k' });
  assert.deepEqual(env, { PATH: '/bin', GIT_SSH_COMMAND: 'ssh -i k' });
});
