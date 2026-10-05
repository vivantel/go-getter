import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { parseFrontmatter } from '../src/frontmatter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packFile = path.join(here, 'fixtures/packs/example/pack.json');
const goldenFile = path.join(here, 'golden/render-example.json');
const pack = loadPack(packFile);
const answers = { 'instruction-cap': 'strict', 'enforce-cap': 'yes' };

function project({ withVocab = true, existingDecisions = 0 } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-render-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  if (withVocab) writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\nguardrail — a guardrail\n');
  for (let i = 1; i <= existingDecisions; i++) {
    mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
    writeFileSync(path.join(dir, `docs/decisions/${String(i).padStart(4, '0')}-old.md`), '---\nid: x\n---\n');
  }
  return dir;
}

function snapshot(dir, paths) {
  return Object.fromEntries(paths.sort().map((p) => [p, readFileSync(path.join(dir, p), 'utf8')]));
}

test('golden: rendering the example pack', () => {
  const dir = project({ existingDecisions: 2 });
  const plan = planRender({ root: dir, pack, answers, acceptedBy: 'tester', date: '2026-10-05' });
  const written = applyRender({ root: dir, plan });
  const actual = snapshot(dir, [...written, 'docs/decisions/INDEX.md', 'docs/guardrails/INDEX.md']);
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
});

test('rendered artifacts carry kms fields and go-getter provenance', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack, answers, acceptedBy: 'tester', date: '2026-10-05' });
  const [decision, guardrail] = plan.artifacts;
  assert.equal(decision.id, '0001-instruction-file-cap');
  const d = parseFrontmatter(decision.content).data;
  assert.equal(d.title, 'The always-loaded instruction file is capped at 200 lines');
  assert.equal(d['accepted-by'], 'tester');
  assert.deepEqual(d['go-getter'], { 'generated-by': 'example@0.1.0', 'pack-answer': 'instruction-cap', 'pack-option': 'strict' });
  const g = parseFrontmatter(guardrail.content).data;
  assert.equal(g['governed-by'], '0001-instruction-file-cap');
  assert.deepEqual(g['grounded-in'], ['0001-instruction-file-cap']);
  assert.equal(g['go-getter'].enforcement[0].run, 'builtin:file-max-lines path=AGENTS.md max=200');
  assert.deepEqual(plan.newTags, ['configuration']);
  rmSync(dir, { recursive: true, force: true });
});

test('questions whose `when` is unmet are skipped; advisory answers emit nothing', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack, answers: { 'instruction-cap': 'relaxed', 'enforce-cap': 'no' }, acceptedBy: 't', date: '2026-10-05' });
  assert.deepEqual(plan.artifacts.map((a) => a.path), ['docs/decisions/0001-instruction-file-cap.md']);
  rmSync(dir, { recursive: true, force: true });
});

test('renderer refuses missing answers, unknown options, missing accountability and overwrites', () => {
  const dir = project();
  const base = { root: dir, pack, acceptedBy: 't', date: '2026-10-05' };
  assert.throws(() => planRender({ ...base, answers: {} }), /no answer for question "instruction-cap"/);
  assert.throws(() => planRender({ ...base, answers: { ...answers, 'instruction-cap': 'huge' } }), /not an option/);
  assert.throws(() => planRender({ ...base, acceptedBy: undefined, answers }), /acceptedBy is required/);
  applyRender({ root: dir, plan: planRender({ ...base, answers }) });
  assert.throws(() => planRender({ ...base, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'yes' } }), /already exists/);
  rmSync(dir, { recursive: true, force: true });
});

test('render-pack CLI supports dry runs and writes nothing then', () => {
  const dir = project();
  const answersFile = path.join(dir, 'answers.json');
  writeFileSync(answersFile, JSON.stringify({ answers, acceptedBy: 't', date: '2026-10-05' }));
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'compiler/bin/go-getter.mjs'), 'render-pack', '--pack-file', packFile, '--answers', answersFile, '--project', dir, '--dry-run'], { encoding: 'utf8' });
  const result = JSON.parse(out);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.paths, ['docs/decisions/0001-instruction-file-cap.md', 'docs/guardrails/instruction-file-within-cap.md', 'docs/skills/tags.md']);
  assert.equal(existsSync(path.join(dir, 'docs/decisions')), false);
  rmSync(dir, { recursive: true, force: true });
});

function typedPack() {
  const p = structuredClone(pack);
  p.questions.push(
    { id: 'check', type: 'text', prompt: 'Which command verifies the project?', detect: 'commands.test', pattern: '^\\S+' },
    { id: 'paths', type: 'list', prompt: 'Which paths are restricted?', default: ['secrets/'], pattern: '/$' },
  );
  p.outputs.check = {
    '*': { facts: [{ slug: 'verify-command', title: 'Verification runs {{answer.check}}', tags: ['configuration'], frontmatter: { kind: 'convention' }, body: 'Run `{{answer.check}}` ({{detect.commands.test}}); restricted: {{answer.paths}}.\n' }] },
  };
  return p;
}
const typedAnswers = { ...answers, check: 'npm test', paths: ['secrets/', 'keys/'] };

test('text answers render as given and list answers comma-joined, with detected values', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack: typedPack(), answers: typedAnswers, acceptedBy: 't', date: '2026-10-05', detect: { commands: { test: 'npm test', lint: null } } });
  const fact = plan.artifacts.find((a) => a.kind === 'facts');
  assert.equal(fact.title, 'Verification runs npm test');
  assert.match(fact.content, /Run `npm test` \(npm test\); restricted: secrets\/, keys\/\./);
  assert.deepEqual(parseFrontmatter(fact.content).data['go-getter'], { 'generated-by': 'example@0.1.0', 'pack-answer': 'check', 'pack-option': 'npm test' });
  rmSync(dir, { recursive: true, force: true });
});

test('a text answer that fails its pattern is rejected, as is a list item', () => {
  const dir = project();
  const base = { root: dir, pack: typedPack(), acceptedBy: 't', date: '2026-10-05', detect: { commands: { test: 'x' } } };
  assert.throws(() => planRender({ ...base, answers: { ...typedAnswers, check: ' leading space' } }), /does not match the pattern of "check"/);
  assert.throws(() => planRender({ ...base, answers: { ...typedAnswers, paths: ['secrets/', 'keys'] } }), /does not match the pattern of "paths"/);
  rmSync(dir, { recursive: true, force: true });
});

test('answer types are enforced and an undetected value fails loudly', () => {
  const dir = project();
  const base = { root: dir, pack: typedPack(), acceptedBy: 't', date: '2026-10-05', detect: { commands: { test: null } } };
  assert.throws(() => planRender({ ...base, answers: { ...typedAnswers, paths: 'secrets/' } }), /takes an array of strings/);
  assert.throws(() => planRender({ ...base, answers: { ...typedAnswers, check: ['npm test'] } }), /takes a string/);
  assert.throws(() => planRender({ ...base, answers: typedAnswers }), /placeholder \{\{detect.commands.test\}\} has no value/);
  rmSync(dir, { recursive: true, force: true });
});
