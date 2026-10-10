import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCheckpoint, listCheckpoints, pruneCheckpoints, restorePlan, sanitizeLabel, CHECKPOINT_REF } from '../src/checkpoint.mjs';

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

function repo({ commit = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-cp-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  writeFileSync(path.join(dir, '.gitignore'), 'secret.log\n');
  if (commit) {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'init');
  }
  return dir;
}

const state = (dir) => ({
  status: git(dir, 'status', '--porcelain'),
  head: git(dir, 'rev-parse', '-q', '--verify', 'HEAD').trim(),
  branches: git(dir, 'branch', '--list'),
  index: git(dir, 'ls-files', '-s'),
});

test('a checkpoint leaves the working tree, index, HEAD and branches untouched', () => {
  const dir = repo();
  writeFileSync(path.join(dir, 'a.txt'), 'edited\n');
  writeFileSync(path.join(dir, 'new.txt'), 'new\n');
  git(dir, 'add', 'a.txt');
  const before = state(dir);
  const cp = createCheckpoint(dir, { label: 'before push' });
  assert.match(cp.ref, new RegExp(`^${CHECKPOINT_REF}/\\d{8}T\\d{9}Z-before-push$`));
  assert.deepEqual(state(dir), before);
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'edited\n');
  rmSync(dir, { recursive: true, force: true });
});

test('the checkpoint holds untracked files and the edit, and not ignored files', () => {
  const dir = repo();
  writeFileSync(path.join(dir, 'a.txt'), 'edited\n');
  writeFileSync(path.join(dir, 'new.txt'), 'new\n');
  writeFileSync(path.join(dir, 'secret.log'), 'token\n');
  const { ref } = createCheckpoint(dir, { label: 'x' });
  const files = git(dir, 'ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean);
  assert.deepEqual(files.sort(), ['.gitignore', 'a.txt', 'new.txt']);
  assert.equal(git(dir, 'show', `${ref}:a.txt`), 'edited\n');
  assert.equal(git(dir, 'rev-parse', `${ref}^`).trim(), git(dir, 'rev-parse', 'HEAD').trim(), 'its parent is HEAD');
  rmSync(dir, { recursive: true, force: true });
});

test('the 11th checkpoint prunes the oldest and creates in the same instant get distinct refs', () => {
  const dir = repo();
  const now = new Date('2026-10-10T10:00:00.000Z');
  const refs = [];
  for (let i = 0; i < 11; i++) refs.push(createCheckpoint(dir, { label: 'same', now: new Date(now.getTime() + (i < 2 ? 0 : i)) }));
  assert.notEqual(refs[0].ref, refs[1].ref);
  assert.equal(listCheckpoints(dir).length, 10);
  assert.equal(refs[10].pruned.length, 1);
  assert.equal(listCheckpoints(dir)[0].ref, refs[10].ref, 'newest first');
  assert.ok(!listCheckpoints(dir).some((c) => c.ref === refs[0].ref), 'the oldest is gone');
  assert.deepEqual(pruneCheckpoints(dir, 3).length, 7);
  assert.equal(listCheckpoints(dir).length, 3);
  rmSync(dir, { recursive: true, force: true });
});

test('it works before the first commit, and outside a git repository it does nothing', () => {
  const dir = repo({ commit: false });
  const cp = createCheckpoint(dir, { label: 'root' });
  assert.equal(git(dir, 'rev-list', '--parents', '-n1', cp.ref).trim().split(' ').length, 1, 'a root commit');
  assert.deepEqual(listCheckpoints(dir).map((c) => c.label), ['root']);
  rmSync(dir, { recursive: true, force: true });
  const plain = mkdtempSync(path.join(tmpdir(), 'gg-cp-plain-'));
  assert.equal(createCheckpoint(plain, {}), null);
  assert.deepEqual(listCheckpoints(plain), []);
  assert.equal(restorePlan(plain, 'x'), null);
  rmSync(plain, { recursive: true, force: true });
});

test('a checkpoint made from a subdirectory covers the whole repository', () => {
  const dir = repo();
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'sub/b.txt'), 'b\n');
  const { ref } = createCheckpoint(path.join(dir, 'sub'), { label: 'sub' });
  assert.ok(git(dir, 'ls-tree', '-r', '--name-only', ref).includes('a.txt'));
  rmSync(dir, { recursive: true, force: true });
});

test('the restore plan lists what changed, what was deleted and what was created since', () => {
  const dir = repo();
  writeFileSync(path.join(dir, 'keep.txt'), 'k\n');
  const { ref } = createCheckpoint(dir, { label: 'base' });
  writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  rmSync(path.join(dir, 'keep.txt'));
  writeFileSync(path.join(dir, 'made-later.txt'), 'x\n');
  const plan = restorePlan(dir, ref);
  const by = Object.fromEntries(plan.changes.map((c) => [c.path, c.status]));
  assert.deepEqual(by, { 'a.txt': 'M', 'keep.txt': 'D', 'made-later.txt': 'A' });
  assert.deepEqual(plan.createdSince, ['made-later.txt']);
  assert.deepEqual(restorePlan(dir, listCheckpoints(dir)[0].ref).changes.length, 3);
  rmSync(dir, { recursive: true, force: true });
});

test('labels are reduced to lower-case words', () => {
  assert.equal(sanitizeLabel('Before: git push --force!'), 'before-git-push-force');
  assert.equal(sanitizeLabel(''), 'checkpoint');
  assert.equal(sanitizeLabel(undefined), 'checkpoint');
  assert.ok(sanitizeLabel('x'.repeat(100)).length <= 40);
});
