import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { planReconfigure, applyReconfigure } from '../src/reconfigure.mjs';
import { parseFrontmatter } from '../src/frontmatter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'bin/go-getter.mjs');
const packFile = path.join(here, 'fixtures/packs/example/pack.json');
const pack = loadPack(packFile);
const base = { acceptedBy: 't', date: '2026-10-05' };

function adopted() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-reconf-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\nguardrail — g\n');
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'yes' }, ...base }) });
  return dir;
}

const fm = (dir, rel) => parseFrontmatter(readFileSync(path.join(dir, rel), 'utf8')).data;
const indexIds = (dir, kind) =>
  readFileSync(path.join(dir, 'docs', kind, 'INDEX.md'), 'utf8').split('\n').slice(3).filter(Boolean).map((l) => [l.split(',')[0], l.split(',').at(-1)]);

test('changing an answer supersedes its decision and re-derives dependent guardrails', () => {
  const dir = adopted();
  const result = planReconfigure({ project: dir, pack, answers: { 'instruction-cap': 'relaxed', 'enforce-cap': 'yes' }, ...base });
  assert.deepEqual(result.changed, ['instruction-cap']);
  applyReconfigure({ project: dir, result });

  const old = fm(dir, 'docs/decisions/0001-instruction-file-cap.md');
  assert.equal(old.status, 'superseded');
  assert.equal(old['superseded-by'], '0002-instruction-file-cap');
  const fresh = fm(dir, 'docs/decisions/0002-instruction-file-cap.md');
  assert.equal(fresh.status, 'active');
  assert.equal(fresh.title, 'The always-loaded instruction file is capped at 500 lines');
  assert.equal(fresh['go-getter']['pack-option'], 'relaxed');
  // The guardrail from the unchanged question now points at the new decision.
  assert.equal(fm(dir, 'docs/guardrails/instruction-file-within-cap.md')['governed-by'], '0002-instruction-file-cap');

  // INDEX rows match files and statuses.
  const decisionFiles = readdirSync(path.join(dir, 'docs/decisions')).filter((f) => f !== 'INDEX.md').map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(indexIds(dir, 'decisions').map(([id]) => id).sort(), decisionFiles);
  assert.deepEqual(Object.fromEntries(indexIds(dir, 'decisions')), { '0001-instruction-file-cap': 'superseded', '0002-instruction-file-cap': 'active' });
  assert.deepEqual(indexIds(dir, 'guardrails'), [['instruction-file-within-cap', 'active']]);
  rmSync(dir, { recursive: true, force: true });
});

test('an answer that stops producing a guardrail deprecates it', () => {
  const dir = adopted();
  const result = planReconfigure({ project: dir, pack, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'no' }, ...base });
  applyReconfigure({ project: dir, result });
  assert.equal(fm(dir, 'docs/guardrails/instruction-file-within-cap.md').status, 'deprecated');
  assert.deepEqual(indexIds(dir, 'guardrails'), [['instruction-file-within-cap', 'deprecated']]);
  assert.equal(fm(dir, 'docs/decisions/0001-instruction-file-cap.md').status, 'active');
  assert.equal(existsSync(path.join(dir, 'docs/decisions/0002-instruction-file-cap.md')), false);
  rmSync(dir, { recursive: true, force: true });
});

test('unchanged answers change no decisions', () => {
  const dir = adopted();
  const result = planReconfigure({ project: dir, pack, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'yes' }, ...base });
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.statusChanges, []);
  assert.ok(result.plan.artifacts.every((a) => a.kind !== 'decisions'));
  rmSync(dir, { recursive: true, force: true });
});

test('reconfigure CLI reports current answers and refuses unadopted packs', () => {
  const dir = adopted();
  const cur = spawnSync(process.execPath, [cli, 'reconfigure', '--pack-file', packFile, '--project', dir, '--current'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(cur.stdout).answers, { 'instruction-cap': 'strict', 'enforce-cap': 'yes' });
  const empty = mkdtempSync(path.join(tmpdir(), 'gg-reconf-empty-'));
  assert.throws(() => planReconfigure({ project: empty, pack, answers: {}, ...base }), /has not been adopted/);
  rmSync(dir, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});
