import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import commitTrailer from '../../src/checks/builtin/commit-trailer.mjs';
import { cleanGitEnv } from '../../src/git-env.mjs';

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env) });

function repo(messages) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-trailer-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  const commit = (message, n) => {
    writeFileSync(path.join(dir, 'f'), String(n));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', message);
  };
  commit('init', 0);
  git(dir, 'tag', 'base');
  messages.forEach((m, i) => commit(m, i + 1));
  return dir;
}

test('commits that carry the trailer pass', () => {
  const dir = repo(['feat: a\n\nwhy\n\nRefs: docs/decisions/0001-x.md']);
  try {
    assert.equal(commitTrailer({ project: dir, args: { trailer: 'Refs', base: 'base' } }).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a commit without it fails and is named', () => {
  const dir = repo(['feat: a\n\nRefs: x', 'fix: b\n\nno trailer here']);
  try {
    const r = commitTrailer({ project: dir, args: { trailer: 'Refs', base: 'base' } });
    assert.equal(r.ok, false);
    assert.match(r.message, /Refs:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a trailer-like line outside the last paragraph does not count', () => {
  const dir = repo(['feat: a\n\nRefs: x\n\nclosing words']);
  try {
    assert.equal(commitTrailer({ project: dir, args: { trailer: 'Refs', base: 'base' } }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no base to compare against passes; a bad trailer name is an error', () => {
  const dir = repo(['feat: a']);
  try {
    assert.equal(commitTrailer({ project: dir, args: { trailer: 'Refs' } }).ok, true);
    assert.equal(commitTrailer({ project: dir, args: { trailer: 'a b' } }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
