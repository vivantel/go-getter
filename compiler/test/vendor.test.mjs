import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncKms, diffVendor, readLock, cleanGitEnv } from '../src/vendor.mjs';

function upstreamRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-upstream-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  mkdirSync(path.join(dir, 'plugins/kms/skills/alpha'), { recursive: true });
  mkdirSync(path.join(dir, 'plugins/kms/shared'), { recursive: true });
  writeFileSync(path.join(dir, 'plugins/kms/skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: a\n---\nSee ../../shared/model.md\n');
  writeFileSync(path.join(dir, 'plugins/kms/shared/model.md'), 'model\n');
  writeFileSync(path.join(dir, 'LICENSE'), 'MIT\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'v1');
  g('tag', '1.0.0');
  return { dir, url: `file://${dir}` };
}

test('sync vendors upstream at a tag and writes the lockfile', () => {
  const up = upstreamRepo();
  const root = mkdtempSync(path.join(tmpdir(), 'gg-root-'));
  const lock = syncKms(root, { repo: up.url, ref: '1.0.0', excludeSkills: ['beta'] });
  assert.equal(lock.ref, '1.0.0');
  assert.match(lock.sha, /^[0-9a-f]{40}$/);
  assert.deepEqual(readLock(root).excludeSkills, ['beta']);
  assert.equal(readFileSync(path.join(root, 'vendor/kms/skills/alpha/SKILL.md'), 'utf8').includes('alpha'), true);
  assert.ok(existsSync(path.join(root, 'vendor/kms/LICENSE')));
  assert.deepEqual(diffVendor(root), []);
  rmSync(root, { recursive: true, force: true });
  rmSync(up.dir, { recursive: true, force: true });
});

test('vendor check catches hand edits, additions and deletions', () => {
  const up = upstreamRepo();
  const root = mkdtempSync(path.join(tmpdir(), 'gg-root-'));
  syncKms(root, { repo: up.url, ref: '1.0.0' });
  writeFileSync(path.join(root, 'vendor/kms/shared/model.md'), 'edited\n');
  writeFileSync(path.join(root, 'vendor/kms/extra.md'), 'x\n');
  rmSync(path.join(root, 'vendor/kms/LICENSE'));
  assert.deepEqual(diffVendor(root), [
    'edited: vendor/kms/shared/model.md',
    'missing: vendor/kms/LICENSE',
    'not upstream: vendor/kms/extra.md',
  ]);
  rmSync(root, { recursive: true, force: true });
  rmSync(up.dir, { recursive: true, force: true });
});

test('sync refuses to run without a ref', () => {
  assert.throws(() => syncKms(mkdtempSync(path.join(tmpdir(), 'gg-root-')), {}), /needs a ref/);
});

test('git commands for the upstream clone never inherit the hooked repository from a git hook', () => {
  const env = cleanGitEnv({ PATH: '/bin', GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/.git/index', GIT_SSH_COMMAND: 'ssh -i k' });
  assert.deepEqual(env, { PATH: '/bin', GIT_SSH_COMMAND: 'ssh -i k' });
});
