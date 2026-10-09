import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender, renameAnswers } from '../src/render.mjs';
import { planReconfigure, applyReconfigure } from '../src/reconfigure.mjs';
import { parseFrontmatter } from '../src/frontmatter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const schema = loadPackSchema(root);
const v1 = loadPack(path.join(here, 'fixtures/packs/example/pack.json'));
const base = { acceptedBy: 't', date: '2026-10-05' };

// The next pack version renames the option "relaxed" to "lenient".
function renamedPack() {
  const next = structuredClone(v1);
  next.version = '0.2.0';
  const q = next.questions.find((x) => x.id === 'instruction-cap');
  q.options.find((o) => o.id === 'relaxed').id = 'lenient';
  q.renamed = { relaxed: 'lenient' };
  for (const x of next.questions) if (x.when?.question === q.id) x.when.in = x.when.in.map((o) => (o === 'relaxed' ? 'lenient' : o));
  next.outputs['instruction-cap'].lenient = next.outputs['instruction-cap'].relaxed;
  delete next.outputs['instruction-cap'].relaxed;
  return next;
}

function adopted() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-renamed-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\nguardrail — g\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack: v1, answers: { 'instruction-cap': 'relaxed', 'enforce-cap': 'yes' }, ...base }) });
  return dir;
}

test('a renamed option validates; a bad map does not', () => {
  assert.deepEqual(validatePack(schema, renamedPack(), { dirName: 'example' }), []);
  const still = structuredClone(v1);
  still.questions[0].renamed = { relaxed: 'strict' };
  assert.ok(validatePack(schema, still, { dirName: 'example' }).some((e) => e.includes('"relaxed" is still an option')));
  const missing = renamedPack();
  missing.questions[0].renamed = { relaxed: 'gone' };
  assert.ok(validatePack(schema, missing, { dirName: 'example' }).some((e) => e.includes('"gone" is not an option')));
  const text = renamedPack();
  text.questions.push({ id: 'cmd', type: 'text', prompt: 'x', default: 'a', renamed: { a: 'b' } });
  text.outputs.cmd = { '*': {} };
  assert.ok(validatePack(schema, text, { dirName: 'example' }).some((e) => e.includes('only choice questions rename options')));
});

test('recorded answers map through the renamed table, single and multi', () => {
  const pack = renamedPack();
  assert.deepEqual(renameAnswers(pack, { 'instruction-cap': 'relaxed', other: 'relaxed' }), { 'instruction-cap': 'lenient', other: 'relaxed' });
  assert.deepEqual(renameAnswers(pack, { 'instruction-cap': ['relaxed', 'strict'] }), { 'instruction-cap': ['lenient', 'strict'] });
});

test('an artifact adopted under the old option id re-renders without a changed answer', () => {
  const dir = adopted();
  const pack = renamedPack();
  // the recorded answers still carry the old id
  const result = planReconfigure({ project: dir, pack, answers: { 'instruction-cap': 'relaxed', 'enforce-cap': 'yes' }, ...base });
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.statusChanges, []);
  applyReconfigure({ project: dir, result });
  const guardrail = parseFrontmatter(readFileSync(path.join(dir, 'docs/guardrails/instruction-file-within-cap.md'), 'utf8')).data;
  assert.equal(guardrail.status, 'active');
  assert.match(guardrail['go-getter']['generated-by'], /@0\.2\.0$/);
  // answering with the new id is the same answer
  assert.deepEqual(planReconfigure({ project: dir, pack, answers: { 'instruction-cap': 'lenient', 'enforce-cap': 'yes' }, ...base }).changed, []);
  rmSync(dir, { recursive: true, force: true });
});
