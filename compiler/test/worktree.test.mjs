// Decision 0156: up to 10 agents run at once, each in its own worktree; `worktree new` refuses the 11th.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { newWorktree, listWorktrees, worktreeConfig } from '../src/worktree.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = loadPack(path.join(root, 'src/packs/orchestration/pack.json'));
const recommended = Object.fromEntries(pack.questions.map((q) => [q.id, q.options ? q.options.find((o) => o.recommended).id : q.default]));

function repo(answers) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-wt10-')));
  const dir = path.join(parent, 'app');
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'practice-packs — x\nagent-roles — x\nharness — x\nguardrail — x\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-11-02' }) });
  writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { parent, dir };
}

test('10 is an option of max-concurrent', () => {
  assert.ok(pack.questions.find((q) => q.id === 'max-concurrent').options.some((o) => o.id === '10'));
});

test('worktree new allows 10 concurrent worktrees and refuses the 11th', () => {
  const { parent, dir } = repo({ ...recommended, 'max-concurrent': '10' });
  try {
    assert.equal(worktreeConfig(dir).max, 10);
    for (let i = 1; i <= 10; i++) newWorktree(dir, `task-${i}`);
    assert.equal(listWorktrees(dir).length, 11, 'the main tree plus 10 linked');
    assert.throws(() => newWorktree(dir, 'task-11'), /limit is 10/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

// A bare origin plus a clone, so fetching has something to do.
function cloneOfOrigin() {
  const { parent, dir } = repo(recommended);
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'ignore' });
  const origin = path.join(parent, 'origin.git');
  git(parent, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  return { parent, dir, origin, git };
}

test('worktree new branches from the current origin default branch, not the last fetched one', () => {
  const { parent, dir, origin, git } = cloneOfOrigin();
  try {
    const other = path.join(parent, 'other');
    git(parent, 'clone', '-q', origin, other);
    git(other, 'config', 'user.email', 't@t'); git(other, 'config', 'user.name', 't'); git(other, 'config', 'commit.gpgsign', 'false');
    writeFileSync(path.join(other, 'later.txt'), 'x');
    git(other, 'add', '.'); git(other, 'commit', '-q', '-m', 'later'); git(other, 'push', '-q', 'origin', 'main');
    const made = newWorktree(dir, 'fresh');
    assert.ok(existsSync(path.join(made.path, 'later.txt')));
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('worktree new still works offline: a failed fetch falls back to what is known', () => {
  const { parent, dir, origin, git } = cloneOfOrigin();
  try {
    rmSync(origin, { recursive: true, force: true });
    assert.ok(newWorktree(dir, 'offline').path);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('concurrent worktree new calls cannot exceed the limit', async () => {
  const { parent, dir } = repo({ ...recommended, 'max-concurrent': '3' });
  try {
    const script = `import { newWorktree } from ${JSON.stringify(path.join(root, 'compiler/src/worktree.mjs'))};
      try { newWorktree(process.argv[1], process.argv[2]); } catch (e) { process.exit(3); }`;
    const codes = await Promise.all(Array.from({ length: 6 }, (_, i) => new Promise((resolve) => {
      spawn(process.execPath, ['--input-type=module', '-e', script, dir, `task-${i}`], { stdio: 'ignore' }).on('exit', resolve);
    })));
    assert.equal(codes.filter((c) => c === 0).length, 3);
    assert.equal(listWorktrees(dir).length, 4);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('a lock left by a dead process does not block worktree new forever', () => {
  const { parent, dir } = repo(recommended);
  try {
    const lock = path.join(dir, '.git', 'go-getter-worktree.lock');
    mkdirSync(lock);
    const old = new Date(Date.now() - 120000);
    utimesSync(lock, old, old);
    assert.ok(newWorktree(dir, 'after-crash').path);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('worktree new for a branch that already has a worktree returns it, even at the limit', () => {
  const { parent, dir } = repo({ ...recommended, 'max-concurrent': '1' });
  try {
    const first = newWorktree(dir, 'resume-me');
    assert.equal(first.existing, undefined);
    const again = newWorktree(dir, 'resume-me');
    assert.equal(again.path, first.path);
    assert.equal(again.existing, true);
    assert.equal(listWorktrees(dir).length, 2, 'no second worktree');
    assert.throws(() => newWorktree(dir, 'another'), /limit is 1/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
