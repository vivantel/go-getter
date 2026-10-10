import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import secretScan, { addedLines, ALLOW_MARKER } from '../src/checks/builtin/secret-scan.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env), encoding: 'utf8' });
// Fake values built from parts so this file is not itself a finding.
const TOKEN = 'ghp_' + 'a1B2'.repeat(9);
const ASSIGN = 'password = "' + 'hunter2'.repeat(3) + '"';

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-scan-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  write(dir, 'README.md', '# hello\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const write = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};
const commit = (dir, message = 'c') => {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
};
const scan = (dir, args = {}) => secretScan({ project: dir, args });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('addedLines reads files, hunk line numbers and skips deletions', () => {
  const diff = ['diff --git a/a.txt b/a.txt', '--- a/a.txt', '+++ b/a.txt', '@@ -1,0 +5,2 @@', '+one', '+two', '@@ -9 +11 @@', '-old', '+new', 'diff --git a/gone b/gone', '--- a/gone', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye'].join('\n');
  assert.deepEqual(addedLines(diff), [
    { file: 'a.txt', line: 5, text: 'one' },
    { file: 'a.txt', line: 6, text: 'two' },
    { file: 'a.txt', line: 11, text: 'new' },
  ]);
});

test('a staged secret fails naming file, line and kind, and never prints the value', () => {
  const dir = repo();
  try {
    write(dir, 'src/config.js', `const a = 1;\nconst t = "${TOKEN}";\n`);
    git(dir, 'add', '-A');
    const r = scan(dir);
    assert.equal(r.ok, false);
    assert.match(r.message, /src\/config\.js:2 github/);
    assert.ok(!r.message.includes(TOKEN) && !r.message.includes('a1B2a1B2'));
  } finally {
    cleanup(dir);
  }
});

test('a labelled assignment is found, and the allow marker on the line skips it', () => {
  const dir = repo();
  try {
    write(dir, 'a.txt', `${ASSIGN}\n`);
    git(dir, 'add', '-A');
    assert.match(scan(dir).message, /a\.txt:1 assignment/);
    write(dir, 'a.txt', `${ASSIGN} # ${ALLOW_MARKER}\n`);
    git(dir, 'add', '-A');
    assert.equal(scan(dir).ok, true);
  } finally {
    cleanup(dir);
  }
});

test('a file under an allowed glob is skipped and another file is not', () => {
  const dir = repo();
  try {
    write(dir, 'tests/fixtures/key.txt', `${TOKEN}\n`);
    git(dir, 'add', '-A');
    assert.equal(scan(dir, { allow: 'tests/**' }).ok, true);
    write(dir, 'src/real.txt', `${TOKEN}\n`);
    git(dir, 'add', '-A');
    const r = scan(dir, { allow: 'tests/**,docs/**' });
    assert.equal(r.ok, false);
    assert.match(r.message, /src\/real\.txt:1/);
    assert.doesNotMatch(r.message, /tests\/fixtures/);
  } finally {
    cleanup(dir);
  }
});

test('commits since the base are scanned, and a secret already on the base is not', () => {
  const dir = repo();
  try {
    write(dir, 'old.txt', `${TOKEN}\n`);
    commit(dir, 'old secret on the base');
    git(dir, 'checkout', '-q', '-b', 'feat/x');
    write(dir, 'new.txt', 'nothing here\n');
    commit(dir, 'harmless');
    assert.equal(scan(dir, { base: 'main' }).ok, true, 'the old secret is not this change');
    write(dir, 'pushed.txt', `${TOKEN}\n`);
    commit(dir, 'adds a secret');
    const r = scan(dir, { base: 'main' });
    assert.equal(r.ok, false);
    assert.match(r.message, /pushed\.txt:1 github/);
    assert.doesNotMatch(r.message, /old\.txt/);
  } finally {
    cleanup(dir);
  }
});

test('no base and nothing staged passes; so does a directory that is not a repository', () => {
  const dir = repo();
  const plain = mkdtempSync(path.join(tmpdir(), 'gg-scan-plain-'));
  try {
    write(dir, 'a.txt', `${TOKEN}\n`);
    commit(dir, 'secret committed with no base to compare against');
    assert.equal(scan(dir).ok, true);
    assert.match(scan(plain).message, /not a git repository/);
  } finally {
    cleanup(dir);
    cleanup(plain);
  }
});

test('the same line staged and committed is reported once; many findings are capped', () => {
  const dir = repo();
  try {
    git(dir, 'checkout', '-q', '-b', 'feat/y');
    write(dir, 'a.txt', `${TOKEN}\n`);
    commit(dir, 'a');
    write(dir, 'b.txt', `${TOKEN}\n`);
    git(dir, 'add', '-A');
    const once = scan(dir, { base: 'main' }).message.match(/github/g);
    assert.equal(once.length, 2, 'a.txt and b.txt, one each');
    write(dir, 'many.txt', Array.from({ length: 25 }, () => TOKEN).join('\n'));
    git(dir, 'add', '-A');
    assert.match(scan(dir, { base: 'main' }).message, /and \d+ more/);
  } finally {
    cleanup(dir);
  }
});

test('the check runs as a builtin with allow passed as a run argument', async () => {
  const { parseRun } = await import('../src/packs.mjs');
  const parsed = parseRun('builtin:secret-scan allow="tests/**,docs/**"');
  assert.equal(parsed.id, 'secret-scan');
  assert.equal(parsed.args.allow, 'tests/**,docs/**');
});

test('the temporary index of a commit -a hook is read when it is inside this repository, and ignored when it is not', () => {
  const dir = repo();
  const outside = mkdtempSync(path.join(tmpdir(), 'gg-scan-index-'));
  const saved = process.env.GIT_INDEX_FILE;
  try {
    write(dir, 'staged.txt', `${TOKEN}\n`);
    const temp = path.join(dir, '.git', 'next-index-1.lock');
    execFileSync('git', ['add', 'staged.txt'], { cwd: dir, env: { ...cleanGitEnv(process.env), GIT_INDEX_FILE: temp } });
    assert.equal(scan(dir).ok, true, 'the real index has nothing staged');
    process.env.GIT_INDEX_FILE = temp;
    assert.match(scan(dir).message, /staged\.txt:1 github/);
    process.env.GIT_INDEX_FILE = path.join(outside, 'index');
    assert.equal(scan(dir).ok, true, 'an index outside the repository is not ours');
  } finally {
    if (saved === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = saved;
    cleanup(dir);
    cleanup(outside);
  }
});
