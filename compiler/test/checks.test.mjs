import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { findHostSpecificLanguage } from '../src/checks/neutral.mjs';
import { guardrailProblems } from '../src/checks/guardrails.mjs';
import { tagProblems } from '../src/checks/tags.mjs';
import { oldestSupportedLts, floorFromEngines } from '../src/checks/node-floor.mjs';
import { readArtifacts, readTagVocabulary } from '../src/artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

const run = (...args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};

test('neutral, guardrails and tags checks pass on this repo', () => {
  for (const name of ['neutral', 'guardrails', 'tags']) {
    const r = run('check', name);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
  }
});

test('neutral check flags host names and host directories', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-neutral-'));
  mkdirSync(path.join(dir, 'skills/x'), { recursive: true });
  writeFileSync(path.join(dir, 'skills/x/SKILL.md'), 'Use the agent.\nOpen .claude/settings.json in Claude Code.\nMove the cursor position.\n');
  const problems = findHostSpecificLanguage(dir);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => p.includes(':2:')));
  rmSync(dir, { recursive: true, force: true });
});

test('guardrail check flags missing enforcement, missing run and unmarked advisory rules', () => {
  const mk = (file, enforcement, body = '') => ({ file, data: { 'go-getter': { enforcement } }, body });
  const problems = guardrailProblems([
    { file: 'a.md', data: {}, body: '' },
    mk('b.md', [{ tier: 3, check: 'x' }]),
    mk('c.md', [{ tier: 1, check: 'x' }], 'Must do x.'),
    mk('d.md', [{ tier: 1, check: 'x' }], 'Advisory (tier 1 only).'),
    mk('e.md', [{ tier: 4, check: '' }]),
  ]);
  assert.deepEqual(problems, [
    'a.md: missing go-getter.enforcement',
    'b.md: enforcement[0] tier 3 needs run',
    'c.md: tier-1-only guardrail must say it is advisory',
    'e.md: enforcement[0].tier must be 1, 2 or 3',
    'e.md: enforcement[0].check is required',
  ]);
});

test('tag check flags unknown tags and non-list tags', () => {
  const vocab = new Set(['a']);
  assert.deepEqual(tagProblems([{ file: 'x.md', data: { tags: ['a', 'b'] } }, { file: 'y.md', data: { tags: 'a' } }], vocab), [
    'x.md: tag "b" is not in docs/skills/tags.md',
    'y.md: tags must be a list',
  ]);
});

test('tag vocabulary and artifacts load from docs/', () => {
  const vocab = readTagVocabulary(root);
  assert.ok(vocab.has('model-routing'));
  assert.ok(readArtifacts(root).length > 40);
});

test('node floor picks the oldest LTS line not past end of life', () => {
  const schedule = {
    v20: { lts: '2023-10-24', end: '2026-04-30' },
    v22: { lts: '2024-10-29', end: '2027-04-30' },
    v24: { lts: '2025-10-28', end: '2028-04-30' },
    v25: { start: '2025-10-01', end: '2026-06-01' },
    v26: { lts: '2026-10-28', end: '2029-04-30' },
  };
  assert.equal(oldestSupportedLts(schedule, '2026-10-05'), 22);
  assert.equal(oldestSupportedLts(schedule, '2027-05-01'), 24);
  assert.equal(oldestSupportedLts(schedule, '2026-01-01'), 20);
  assert.equal(floorFromEngines('>=22'), 22);
  assert.equal(floorFromEngines('>=22.0.0'), 22);
  assert.equal(floorFromEngines('^22'), null);
});
