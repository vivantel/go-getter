import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const env = { ...cleanGitEnv(process.env), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const plan = (marker) => `# Plan\n\n### 1.1 First — [${marker}]\nClass: explore · Needs: none\nDone-when: done.\n\n### 1.2 Second — [ ]\nClass: explore · Needs: 1.1\nDone-when: done.\n`;

// A bare origin whose master marks 1.1 done, and a clone of it before that merge, on a feature branch.
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-plan-stale-'));
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const clone = path.join(dir, 'clone');
  git(dir, 'init', '--bare', '-b', 'master', origin);
  git(dir, 'clone', '-q', origin, seed);
  mkdirSync(path.join(seed, 'docs', 'plans'), { recursive: true });
  writeFileSync(path.join(seed, 'docs', 'plans', 'p.md'), plan(' '));
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'plan');
  git(seed, 'push', '-q', 'origin', 'HEAD:master');
  git(dir, 'clone', '-q', origin, clone);
  git(clone, 'checkout', '-qb', 'feat/x');
  return { dir, origin, seed, clone, mergeOnMaster() {
    writeFileSync(path.join(seed, 'docs', 'plans', 'p.md'), plan('x'));
    git(seed, 'commit', '-qam', 'mark 1.1 done');
    git(seed, 'push', '-q', 'origin', 'HEAD:master');
  } };
}

const run = (cwd, ...args) => spawnSync(process.execPath, [cli, 'plan', ...args], { cwd, env, encoding: 'utf8' });

test('a branch behind the default branch gets the warning and stale: true', () => {
  const f = fixture();
  try {
    f.mergeOnMaster();
    const next = run(f.clone, 'next');
    assert.match(next.stderr, /feat\/x is behind origin\/master by 1 commit/);
    assert.match(next.stdout, /1\.1/);
    const status = JSON.parse(run(f.clone, 'status', '--json').stdout);
    assert.equal(status.stale, true);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('an up-to-date branch gets neither', () => {
  const f = fixture();
  try {
    const next = run(f.clone, 'next');
    assert.equal(next.stderr, '');
    assert.equal(JSON.parse(run(f.clone, 'status', '--json').stdout).stale, false);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('--from-default reads the default branch step states', () => {
  const f = fixture();
  try {
    f.mergeOnMaster();
    const next = run(f.clone, 'next', '--from-default');
    assert.match(next.stdout, /1\.2 Second/);
    assert.doesNotMatch(next.stdout, /1\.1 First/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('an unreachable remote compares with the last fetch and says so', () => {
  const f = fixture();
  try {
    git(f.clone, 'remote', 'set-url', 'origin', path.join(f.dir, 'gone.git'));
    const next = run(f.clone, 'next');
    assert.match(next.stderr, /fetch failed; compared with the last fetched origin\/master/);
    assert.equal(next.status, 0);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
