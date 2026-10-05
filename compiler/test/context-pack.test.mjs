import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { runTier3 } from '../src/enforce.mjs';
import { planReconfigure, applyReconfigure } from '../src/reconfigure.mjs';
import { resolveLevel } from '../src/watch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = loadPack(path.join(root, 'src/packs/context/pack.json'));
const recommended = Object.fromEntries(pack.questions.map((q) => [q.id, q.options.find((o) => o.recommended).id]));

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-context-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nharness — x\ncost — x\nguardrail — x\n');
  return dir;
}

test('the context pack is valid and covers component 4', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'context' }), []);
  assert.deepEqual(pack.components, [4]);
});

test('every answer combination renders', () => {
  for (const q of pack.questions) {
    for (const o of q.options) {
      const dir = project();
      const plan = planRender({ root: dir, pack, answers: { ...recommended, [q.id]: o.id }, acceptedBy: 't', date: '2026-10-05' });
      assert.ok(plan.artifacts.some((a) => a.kind === 'decisions'), `${q.id}=${o.id} records a decision`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the recommended cap fails the check once AGENTS.md exceeds 150 lines', async () => {
  const dir = project();
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: recommended, acceptedBy: 't', date: '2026-10-05' }) });
  const run = async (lines) => {
    writeFileSync(path.join(dir, 'AGENTS.md'), `${'line\n'.repeat(lines)}`);
    return (await runTier3(dir, { onlyGuardrail: 'instruction-file-within-cap' }))[0];
  };
  assert.equal((await run(150)).ok, true);
  const over = await run(151);
  assert.equal(over.ok, false);
  assert.match(over.message, /151 lines, cap is 150/);
  rmSync(dir, { recursive: true, force: true });
});

test('tier-3 commands run without the hooked repository pinned by git hook variables', async () => {
  const dir = project();
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/guardrails/no-hook-git-env.md'), '---\nid: no-hook-git-env\ntitle: t\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 3\n      check: "GIT_DIR is not inherited"\n      run: "sh -c \'test -z \\"$GIT_DIR\\"\'"\n---\n\nBody.\n');
  const before = process.env.GIT_DIR;
  process.env.GIT_DIR = path.join(dir, '.git');
  try {
    const result = (await runTier3(dir, { onlyGuardrail: 'no-hook-git-env' }))[0];
    assert.equal(result.ok, true, result.message);
  } finally {
    if (before === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('each watcher-noise answer sets the level go-getter watch reads', () => {
  for (const level of ['quiet', 'normal', 'verbose']) {
    const dir = project();
    applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: { ...recommended, 'watcher-noise': level }, acceptedBy: 't', date: '2026-10-05' }) });
    assert.equal(resolveLevel(dir), level);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adding the watcher-noise answer to an adopted pack takes the next free decision number', () => {
  const dir = project();
  const { 'watcher-noise': _, ...before } = recommended;
  const v1 = { ...pack, version: '0.1.0', questions: pack.questions.filter((q) => q.id !== 'watcher-noise') };
  applyRender({ root: dir, plan: planRender({ root: dir, pack: v1, answers: before, acceptedBy: 't', date: '2026-10-05' }) });
  const result = planReconfigure({ project: dir, pack, answers: recommended, acceptedBy: 't', date: '2026-10-05' });
  assert.deepEqual(result.changed, ['watcher-noise']);
  assert.ok(result.plan.artifacts.some((a) => a.path === 'docs/decisions/0006-watcher-noise.md'), result.plan.artifacts.map((a) => a.path).join(', '));
  applyReconfigure({ project: dir, result });
  assert.equal(resolveLevel(dir), 'quiet');
  rmSync(dir, { recursive: true, force: true });
});
