// WP9: a project that answers `worktree-pool` gets the decisions, guardrails and procedure, and the pool reads its settings from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { poolConfig, BRANCH_PATTERN } from '../src/pool/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = loadPack(path.join(root, 'src/packs/orchestration/pack.json'));
const recommended = Object.fromEntries(pack.questions.map((q) => [q.id, q.options ? q.options.find((o) => o.recommended)?.id : q.default]));

function project(answers) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-poolpack-')));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nagent-roles — x\nharness — x\nguardrail — x\nprocedural — x\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-11-22' }) });
  return dir;
}
const poolAnswers = (extra = {}) => {
  const a = { ...recommended, isolation: 'worktree-pool', 'pool-size': '4', 'pool-warm': '1', 'pool-warm-command': 'npm ci', 'pool-base': 'develop', 'pool-claim-grace': '120', 'pool-session-ttl': '3600', 'pool-scratch': 'dist/, build/', 'pool-branch-pattern': '^(feat|fix)/[a-z0-9-]+$', 'pool-only': 'on', ...extra };
  delete a['worktree-location'];
  return a;
};

test('the pack is valid and every pool question names its default and depends on the pool answer', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'orchestration' }), []);
  const poolQs = pack.questions.filter((q) => q.id.startsWith('pool-'));
  assert.equal(poolQs.length, 9);
  for (const q of poolQs) {
    assert.deepEqual(q.when, { question: 'isolation', in: ['worktree-pool'] }, q.id);
    assert.ok(q.default !== undefined, q.id);
  }
  assert.equal(pack.questions.find((q) => q.id === 'isolation').options.filter((o) => o.recommended).length, 1);
});

test('answering worktree-pool renders the decisions, both guardrails and the procedure, and poolConfig reads the answers', () => {
  const dir = project(poolAnswers());
  const list = (d) => (existsSync(path.join(dir, 'docs', d)) ? readdirSync(path.join(dir, 'docs', d)) : []);
  assert.ok(list('guardrails').some((f) => f.includes('work-happens-in-pool-worktrees')));
  assert.ok(list('guardrails').some((f) => f.includes('release-the-slot-when-work-is-done')));
  assert.ok(list('skills').includes('using-the-worktree-pool.md'));
  assert.equal(list('guardrails').some((f) => f.includes('parallel-tasks-use-worktrees')), false);
  const g = readFileSync(path.join(dir, 'docs/guardrails', list('guardrails').find((f) => f.includes('work-happens-in-pool-worktrees'))), 'utf8');
  assert.match(g, /run: builtin:pool-isolation/);
  assert.deepEqual(poolConfig(dir, {}), {
    enabled: true, size: 4, warm: 1, warmCommand: 'npm ci', base: 'develop', claimGraceSeconds: 120, sessionTtlSeconds: 3600,
    scratch: ['dist/', 'build/'], branchPattern: '^(feat|fix)/[a-z0-9-]+$', only: true,
  });
  rmSync(dir, { recursive: true, force: true });
});

test('the pool defaults are the shipped values, and a project that does not answer worktree-pool gets no pool', () => {
  const dir = project(poolAnswers(Object.fromEntries(pack.questions.filter((q) => q.id.startsWith('pool-')).map((q) => [q.id, q.default]))));
  const c = poolConfig(dir, {});
  assert.deepEqual([c.enabled, c.size, c.warm, c.warmCommand, c.base, c.scratch, c.branchPattern, c.only], [true, 10, 2, '', null, [], BRANCH_PATTERN, false]);
  rmSync(dir, { recursive: true, force: true });
  const plain = project(recommended);
  assert.equal(poolConfig(plain, {}).enabled, false);
  assert.equal(readdirSync(path.join(plain, 'docs/guardrails')).some((f) => f.includes('pool')), false);
  rmSync(plain, { recursive: true, force: true });
});
