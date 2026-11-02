// Decision 0156: `run next` returns up to the free agent slots, with disjoint files and satisfied Needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startRun } from '../src/runs/record.mjs';
import { nextInRun, filesOf } from '../src/runs/next.mjs';

const step = (i, { needs = 'none', todo = 'x.', marker = ' ' } = {}) => `### ${i} Step ${i} — [${marker}] ‖\nClass: implement · Effort: low · Needs: ${needs} · Check: \`true\`\nDo: ${todo}\nDone-when: done ${i}.\n`;
const PLAN = (steps) => `# P — plan\n\n**Status legend**: x\n\n${steps.join('\n')}`;

function setup(steps, ids) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-next-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN(steps));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  startRun(dir, { plan: 'docs/plans/p.md', steps: ids });
  return { dir, cleanup: () => { saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved); rmSync(base, { recursive: true, force: true }); } };
}

test('filesOf finds file paths in Do text', () => {
  assert.deepEqual([...filesOf('edit `compiler/src/a.mjs` and ./docs/b.md, see e.g. the rest.')].sort(), ['compiler/src/a.mjs', 'docs/b.md']);
});

test('run next returns disjoint steps, skipping one that names an already taken file', () => {
  const s = setup([step(1, { todo: 'edit src/a.mjs.' }), step(2, { todo: 'edit src/b.mjs.' }), step(3, { todo: 'also edit src/a.mjs.' }), step(4, { todo: 'edit README.md.' })], ['1', '2', '3', '4']);
  try {
    const r = nextInRun(s.dir, { record: false });
    assert.equal(r.step.id, '1');
    assert.deepEqual(r.steps.map((x) => x.id), ['1', '2', '4']);
  } finally { s.cleanup(); }
});

test('run next never returns a step whose Needs are not done', () => {
  const s = setup([step(1, { todo: 'edit src/a.mjs.' }), step(2, { needs: '1', todo: 'edit src/b.mjs.' }), step(3, { needs: 'none', todo: 'edit src/c.mjs.' })], ['1', '2', '3']);
  try {
    assert.deepEqual(nextInRun(s.dir, { record: false }).steps.map((x) => x.id), ['1', '3']);
    writeFileSync(path.join(s.dir, 'docs/plans/p.md'), PLAN([step(1, { marker: 'x', todo: 'edit src/a.mjs.' }), step(2, { needs: '1', todo: 'edit src/b.mjs.' }), step(3, { todo: 'edit src/c.mjs.' })]));
    assert.deepEqual(nextInRun(s.dir, { record: false }).steps.map((x) => x.id), ['2', '3']);
  } finally { s.cleanup(); }
});

test('run next returns at most the free slots (default limit 3 without an adopted pack)', () => {
  const steps = [1, 2, 3, 4, 5].map((i) => step(i, { todo: `edit src/f${i}.mjs.` }));
  const s = setup(steps, ['1', '2', '3', '4', '5']);
  try {
    assert.deepEqual(nextInRun(s.dir, { record: false }).steps.map((x) => x.id), ['1', '2', '3']);
    execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: s.dir });
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'b1', path.join(s.dir, '..', 'w1')], { cwd: s.dir });
    assert.deepEqual(nextInRun(s.dir, { record: false }).steps.map((x) => x.id), ['1', '2'], 'one slot is taken by a linked worktree');
  } finally { s.cleanup(); }
});
