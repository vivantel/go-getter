// A pack that takes over questions of a retired pack (`replaces`, decision 0132): update relabels the retired pack's
// artifacts instead of asking again, and the pack schema checks the declaration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';
import { adoptedPacks } from '../src/manifest.mjs';
import { readArtifacts } from '../src/artifacts.mjs';
import { runUpdate } from '../src/update.mjs';
import { applyPlan, planApply } from '../src/apply.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAGS = ['practice-packs', 'guardrail'];

const choice = (id) => ({
  id,
  prompt: `Question ${id}?`,
  options: [
    { id: 'on', label: 'On', tradeoff: 'More.', recommended: true },
    { id: 'off', label: 'Off', tradeoff: 'Less.' },
  ],
});
const decision = (q, text) => ({ slug: `${q}-choice`, title: `${q} is ${text}`, tags: TAGS, frontmatter: { track: 'process' }, body: `## Decision\n\n${q} is ${text} (pack {{pack.id}}@{{pack.version}}).\n\n## Why\n\nTest.\n` });
const guardrail = (q) => ({
  slug: `${q}-rule`,
  title: `${q} rule`,
  tags: TAGS,
  frontmatter: { 'governed-by': `{{id.decision.${q}}}`, 'grounded-in': [`{{id.decision.${q}}}`], 'derivation-note': 'Test.' },
  enforcement: [{ tier: 3, check: 'Test', run: 'builtin:prompt-logging-off' }],
  body: `## Guardrail\n\n${q} holds.\n`,
});
const outputs = (qs) => Object.fromEntries(qs.map((q) => [q, { on: { decisions: [decision(q, 'on')], guardrails: [guardrail(q)] }, off: { decisions: [decision(q, 'off')] } }]));
const pack = (id, version, qs, replaces) => ({
  id,
  version,
  family: 'harness',
  components: [7],
  title: id,
  summary: id,
  ...(replaces ? { replaces: { pack: replaces, questions: qs } } : {}),
  questions: qs.map(choice),
  outputs: outputs(qs),
});

function scratchRoot(packs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-takeover-root-'));
  for (const p of packs) {
    mkdirSync(path.join(dir, 'src/packs', p.id), { recursive: true });
    writeFileSync(path.join(dir, 'src/packs', p.id, 'pack.json'), JSON.stringify(p));
  }
  return dir;
}

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-takeover-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), `# Tags\n\n${TAGS.map((t) => `${t} — x`).join('\n')}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

const old = pack('oldp', '0.5.0', ['alpha', 'beta']);
const partA = pack('part-a', '0.6.0', ['alpha'], 'oldp');
const partB = pack('part-b', '0.6.0', ['beta'], 'oldp');

test('the schema accepts replaces and refuses a question the pack does not have, and a self-replacing pack', () => {
  const schema = loadPackSchema(root);
  assert.deepEqual(validatePack(schema, partA, { dirName: 'part-a' }), []);
  assert.match(validatePack(schema, { ...partA, replaces: { pack: 'oldp', questions: ['gamma'] } }).join('\n'), /"gamma" is not a question of this pack/);
  assert.match(validatePack(schema, { ...partA, replaces: { pack: 'part-a', questions: ['alpha'] } }).join('\n'), /cannot replace itself/);
  assert.notDeepEqual(validatePack(schema, { ...partA, replaces: { pack: 'oldp' } }), []);
});

test('update moves a project adopted at the retired pack to the packs that took it over, keeping every answer', () => {
  const dir = project();
  const fake = scratchRoot([partA, partB]);
  try {
    applyRender({ root: dir, plan: planRender({ root: dir, pack: old, answers: { alpha: 'off', beta: 'on' }, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
    applyPlan(dir, planApply(dir));
    assert.deepEqual(adoptedPacks(dir), { oldp: '0.5.0' });

    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-11' });

    assert.deepEqual(notes.filter((n) => /pack |taken over|no recorded answer/.test(n)), []);
    const packs = adoptedPacks(dir);
    assert.ok(packs['part-a'] && packs['part-b'], 'both packs are adopted');
    assert.equal(packs.oldp, undefined, 'the retired pack is no longer adopted');
    assert.equal(currentAnswers(adoptedArtifacts(dir, 'part-a')).alpha, 'off');
    assert.equal(currentAnswers(adoptedArtifacts(dir, 'part-b')).beta, 'on');
    // The unchanged decisions keep the version the project adopted; the guardrail is re-rendered in place.
    const decisions = readArtifacts(dir).filter((a) => a.type === 'decisions' && a.data['go-getter']?.['pack-answer']);
    assert.deepEqual(decisions.map((d) => d.data['go-getter']['generated-by']).sort(), ['part-a@0.5.0', 'part-b@0.5.0']);
    const guard = readArtifacts(dir).find((a) => a.id === 'beta-rule');
    assert.equal(guard.data['go-getter']['generated-by'], 'part-b@0.6.0');
    // A second update changes nothing.
    const snapshot = () => Object.fromEntries(['decisions', 'guardrails'].flatMap((d) => readdirSync(path.join(dir, 'docs', d)).map((f) => [`${d}/${f}`, readFileSync(path.join(dir, 'docs', d, f), 'utf8')])));
    const before = snapshot();
    const again = runUpdate(dir, { root: fake, date: '2026-10-12' });
    assert.deepEqual(again.notes.filter((n) => /pack |taken over|no recorded answer/.test(n)), []);
    assert.deepEqual(snapshot(), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('the relabel changes only generated-by: a decision body the owner edited is kept', () => {
  const dir = project();
  const fake = scratchRoot([partA, partB]);
  try {
    applyRender({ root: dir, plan: planRender({ root: dir, pack: old, answers: { alpha: 'on', beta: 'on' }, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
    applyPlan(dir, planApply(dir));
    const file = path.join(dir, 'docs/decisions', readdirSync(path.join(dir, 'docs/decisions')).find((f) => /alpha-choice/.test(f)));
    writeFileSync(file, readFileSync(file, 'utf8').replace('Test.', 'Test, edited by the owner.'));
    runUpdate(dir, { root: fake, date: '2026-10-11' });
    const text = readFileSync(file, 'utf8');
    assert.match(text, /edited by the owner/);
    assert.match(text, /generated-by: part-a@0\.5\.0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('update leaves an artifact of the retired pack that no pack took over, and says so', () => {
  const dir = project();
  const fake = scratchRoot([partA]);
  try {
    applyRender({ root: dir, plan: planRender({ root: dir, pack: old, answers: { alpha: 'on', beta: 'on' }, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
    applyPlan(dir, planApply(dir));
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-11' });
    assert.ok(notes.some((n) => /"beta" is taken over by no pack/.test(n)), notes.join('\n'));
    const beta = readArtifacts(dir).find((a) => a.id === 'beta-rule');
    assert.match(beta.data['go-getter']['generated-by'], /^oldp@/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('a retired pack that this version still ships is not relabelled', () => {
  const dir = project();
  const fake = scratchRoot([old, partA, partB]);
  try {
    applyRender({ root: dir, plan: planRender({ root: dir, pack: old, answers: { alpha: 'on', beta: 'on' }, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
    applyPlan(dir, planApply(dir));
    runUpdate(dir, { root: fake, date: '2026-10-11' });
    assert.ok(adoptedPacks(dir).oldp, 'the shipped pack stays adopted');
    assert.equal(adoptedPacks(dir)['part-a'], undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('a pack file in this repository that declares replaces is valid', () => {
  const schema = loadPackSchema(root);
  for (const id of readdirSync(path.join(root, 'src/packs'))) {
    assert.deepEqual(validatePack(schema, loadPack(path.join(root, 'src/packs', id, 'pack.json')), { dirName: id }), [], id);
  }
});
