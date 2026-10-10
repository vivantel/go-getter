import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { collectEnforcement } from '../src/enforce.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const goldenFile = path.join(here, 'golden/git-workflow-pack.json');
const pack = loadPack(path.join(root, 'src/packs/git-workflow/pack.json'));
const pattern = '^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$';
const recommended = { 'branch-pattern': pattern, 'default-branch': 'protect', refs: 'encouraged' };

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gwpack-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\ngit-hooks — x\nguardrail — x\nprocedural — x\n');
  return dir;
}
const adopt = (dir, answers = recommended) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-10' }) });
const tiers = (dir, guardrail) => collectEnforcement(dir).filter((e) => e.guardrail === guardrail).map((e) => e.tier);

test('the git-workflow pack is a valid SDLC pack with no component', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'git-workflow' }), []);
  assert.equal(pack.family, 'sdlc');
  assert.equal(pack.components, undefined);
});

test('the recommended path renders tier-3 branch and default-branch checks and the fixed rules', () => {
  const dir = project();
  adopt(dir);
  assert.deepEqual(tiers(dir, 'branch-names-follow-the-pattern'), [3, 1]);
  assert.deepEqual(tiers(dir, 'no-commits-on-the-default-branch'), [3, 1]);
  assert.deepEqual(tiers(dir, 'commit-subjects-are-conventional'), [3]);
  assert.deepEqual(tiers(dir, 'changes-land-as-one-squashed-pull-request'), [1]);
  const branch = collectEnforcement(dir).find((e) => e.guardrail === 'branch-names-follow-the-pattern' && e.tier === 3);
  assert.equal(branch.parsed.id, 'branch-name');
  assert.equal(branch.parsed.args.pattern, pattern);
  assert.equal(branch.parsed.args.allow, 'main,master');
  assert.equal(existsSync(path.join(dir, 'docs/guardrails/commits-carry-refs-trailers.md')), false);
  assert.match(readFileSync(path.join(dir, 'docs/skills/working-a-change.md'), 'utf8'), /squash merge/);
  rmSync(dir, { recursive: true, force: true });
});

test('instruction only for the default branch has no tier-3 entry', () => {
  const dir = project();
  adopt(dir, { ...recommended, 'default-branch': 'instruction-only' });
  assert.deepEqual(tiers(dir, 'no-commits-on-the-default-branch'), [1]);
  rmSync(dir, { recursive: true, force: true });
});

test('required Refs adds a tier-3 trailer check; encouraged and off add none', () => {
  const dir = project();
  adopt(dir, { ...recommended, refs: 'required' });
  const entry = collectEnforcement(dir).find((e) => e.guardrail === 'commits-carry-refs-trailers');
  assert.equal(entry.tier, 3);
  assert.equal(entry.parsed.id, 'commit-trailer');
  assert.equal(entry.parsed.args.trailer, 'Refs');
  rmSync(dir, { recursive: true, force: true });
  for (const refs of ['encouraged', 'off']) {
    const d = project();
    adopt(d, { ...recommended, refs });
    assert.equal(existsSync(path.join(d, 'docs/guardrails/commits-carry-refs-trailers.md')), false, refs);
    rmSync(d, { recursive: true, force: true });
  }
});

test('golden: the artifacts of the recommended path', () => {
  const dir = project();
  const plan = planRender({ root: dir, pack, answers: recommended, acceptedBy: 'tester', date: '2026-10-10' });
  applyRender({ root: dir, plan });
  const actual = Object.fromEntries(plan.artifacts.map((a) => [a.path, readFileSync(path.join(dir, a.path), 'utf8')]).sort());
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
});
