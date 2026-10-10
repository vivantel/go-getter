import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import notOnDefaultBranch from '../../src/checks/builtin/not-on-default-branch.mjs';
import { cleanGitEnv } from '../../src/git-env.mjs';

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env) });

// A repository whose origin/HEAD names `main`, checked out on `branch`.
function repo(branch, { remote = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-default-branch-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(path.join(dir, 'f'), 'x');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  if (remote) {
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  }
  if (branch !== 'main') git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}

const withEnv = (env, fn) => {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};
const local = { GITHUB_ACTIONS: undefined, GITHUB_HEAD_REF: undefined };

test('a commit on the default branch fails and a type/slug branch passes', () => {
  const onMain = repo('main');
  const onFeature = repo('feat/slug');
  try {
    assert.equal(withEnv(local, () => notOnDefaultBranch({ project: onMain, args: {} })).ok, false);
    assert.equal(withEnv(local, () => notOnDefaultBranch({ project: onFeature, args: {} })).ok, true);
  } finally {
    rmSync(onMain, { recursive: true, force: true });
    rmSync(onFeature, { recursive: true, force: true });
  }
});

test('a detached HEAD passes', () => {
  const dir = repo('main');
  try {
    git(dir, 'checkout', '-q', '--detach');
    assert.equal(withEnv(local, () => notOnDefaultBranch({ project: dir, args: {} })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('allow lets a named default branch through', () => {
  const dir = repo('main');
  try {
    assert.equal(withEnv(local, () => notOnDefaultBranch({ project: dir, args: { allow: 'main' } })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown default branch passes instead of guessing', () => {
  const dir = repo('main', { remote: false });
  try {
    assert.equal(withEnv(local, () => notOnDefaultBranch({ project: dir, args: {} })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('in CI only a pull request head counts', () => {
  const dir = repo('main');
  try {
    assert.equal(withEnv({ GITHUB_ACTIONS: 'true', GITHUB_HEAD_REF: undefined }, () => notOnDefaultBranch({ project: dir, args: {} })).ok, true);
    assert.equal(withEnv({ GITHUB_ACTIONS: 'true', GITHUB_HEAD_REF: 'main' }, () => notOnDefaultBranch({ project: dir, args: {} })).ok, false);
    assert.equal(withEnv({ GITHUB_ACTIONS: 'true', GITHUB_HEAD_REF: 'feat/x' }, () => notOnDefaultBranch({ project: dir, args: {} })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
