// Decision 0156: up to 10 agents run at once, each in its own worktree; `worktree new` refuses the 11th.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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
