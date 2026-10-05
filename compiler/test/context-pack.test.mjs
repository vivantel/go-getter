import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { runTier3 } from '../src/enforce.mjs';

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
