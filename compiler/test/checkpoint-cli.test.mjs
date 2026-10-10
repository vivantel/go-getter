import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
const gg = (dir, ...args) => spawnSync('node', [cli, 'checkpoint', ...args], { cwd: dir, encoding: 'utf8' });

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-cpcli-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  writeFileSync(path.join(dir, 'gone.txt'), 'bye\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

test('create prints the ref and list shows it', () => {
  const dir = repo();
  const made = gg(dir, 'create', '--label', 'before push');
  assert.equal(made.status, 0);
  const ref = made.stdout.trim();
  assert.match(ref, /^refs\/go-getter\/checkpoints\/\d{8}T\d{9}Z-before-push$/);
  const list = gg(dir, 'list');
  assert.equal(list.status, 0);
  assert.ok(list.stdout.includes('before-push') && list.stdout.includes(ref));
  assert.equal(gg(mkdtempSync(path.join(tmpdir(), 'gg-cpnone-')), 'list').stdout.trim(), 'no checkpoints');
  rmSync(dir, { recursive: true, force: true });
});

test('restore without --yes changes nothing; with --yes it puts back edited and deleted files and keeps newer ones', () => {
  const dir = repo();
  gg(dir, 'create', '--label', 'base');
  writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  rmSync(path.join(dir, 'gone.txt'));
  writeFileSync(path.join(dir, 'later.txt'), 'later\n');
  const before = git(dir, 'status', '--porcelain');
  const dry = gg(dir, 'restore', 'base');
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /M\ta\.txt/);
  assert.match(dry.stdout, /D\tgone\.txt/);
  assert.match(dry.stdout, /A\tlater\.txt/);
  assert.match(dry.stdout, /Nothing changed/);
  assert.equal(git(dir, 'status', '--porcelain'), before);
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'changed\n');
  const real = gg(dir, 'restore', 'base', '--yes');
  assert.equal(real.status, 0);
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'one\n');
  assert.equal(readFileSync(path.join(dir, 'gone.txt'), 'utf8'), 'bye\n');
  assert.ok(existsSync(path.join(dir, 'later.txt')), 'a file created since stays');
  assert.match(real.stdout, /created since: later\.txt/);
  rmSync(dir, { recursive: true, force: true });
});

test('restore finds the newest checkpoint by default and fails on an unknown name', () => {
  const dir = repo();
  assert.equal(gg(dir, 'restore').status, 1);
  gg(dir, 'create', '--label', 'first');
  writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  gg(dir, 'create', '--label', 'second');
  writeFileSync(path.join(dir, 'a.txt'), 'three\n');
  assert.equal(gg(dir, 'restore', '--yes').status, 0);
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'two\n');
  const bad = gg(dir, 'restore', 'nope', '--yes');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no checkpoint matching "nope"/);
  rmSync(dir, { recursive: true, force: true });
});

test('prune keeps the newest n, and bad input exits non-zero', () => {
  const dir = repo();
  for (const l of ['a', 'b', 'c']) gg(dir, 'create', '--label', l);
  assert.match(gg(dir, 'prune', '--keep', '1').stdout, /pruned 2; kept 1/);
  assert.equal(gg(dir, 'prune', '--keep', 'x').status, 2);
  assert.equal(gg(dir, 'bogus').status, 2);
  assert.equal(gg(mkdtempSync(path.join(tmpdir(), 'gg-cpnone-')), 'create').status, 1);
  rmSync(dir, { recursive: true, force: true });
});
