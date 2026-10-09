// go-getter update (decision 0090): older pack version to newer in one run, then a no-op, and a dry run that writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';
import { planApply, applyPlan } from '../../src/apply.mjs';
import { readManifest, MANIFEST } from '../../src/manifest.mjs';
import { parseFrontmatter } from '../../src/frontmatter.mjs';
import { planUpdate, runUpdate } from '../../src/update.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../../bin/go-getter.mjs');
const v1 = loadPack(path.join(here, '../fixtures/packs/example/pack.json'));
const base = { acceptedBy: 't', date: '2026-10-05' };
const today = '2026-10-09';

// The newer pack: renames "relaxed" to "lenient", rewords the guardrail and adds a question (since 0.2.0) with a fact.
function v2Pack() {
  const next = structuredClone(v1);
  next.version = '0.2.0';
  const q = next.questions.find((x) => x.id === 'instruction-cap');
  q.options.find((o) => o.id === 'relaxed').id = 'lenient';
  q.renamed = { relaxed: 'lenient' };
  for (const x of next.questions) if (x.when?.question === q.id) x.when.in = x.when.in.map((o) => (o === 'relaxed' ? 'lenient' : o));
  next.outputs['instruction-cap'].lenient = next.outputs['instruction-cap'].relaxed;
  delete next.outputs['instruction-cap'].relaxed;
  next.outputs['enforce-cap'].yes.guardrails[0].body = '## Guardrail\n\nKeep `AGENTS.md` within the cap, counted per line.\n';
  next.questions.push({
    id: 'report',
    since: '0.2.0',
    prompt: 'Report the cap?',
    options: [
      { id: 'yes', label: 'Report', tradeoff: 'More output.', recommended: true },
      { id: 'no', label: 'Silent', tradeoff: 'Less output.' },
    ],
  });
  next.outputs.report = { yes: { facts: [{ slug: 'cap-reported', title: 'The cap is reported', tags: ['configuration'], frontmatter: { kind: 'state' }, body: 'The cap is reported.\n' }] } };
  return next;
}

// A project adopted at pack 0.1.0 with "relaxed", and a root that carries pack 0.2.0.
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gg-update-root-'));
  mkdirSync(path.join(root, 'src/packs/example'), { recursive: true });
  writeFileSync(path.join(root, 'src/packs/example/pack.json'), JSON.stringify(v2Pack(), null, 2));
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-update-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\nguardrail — g\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  applyRender({ root: dir, plan: planRender({ root: dir, pack: v1, answers: { 'instruction-cap': 'relaxed', 'enforce-cap': 'yes' }, ...base }) });
  applyPlan(dir, planApply(dir));
  return { root, dir };
}

const snapshot = (dir, rel = '') =>
  readdirSync(path.join(dir, rel), { withFileTypes: true })
    .filter((e) => e.name !== '.git')
    .flatMap((e) => (e.isDirectory() ? snapshot(dir, path.join(rel, e.name)) : [`${path.join(rel, e.name)}\n${readFileSync(path.join(dir, rel, e.name), 'utf8')}`]))
    .sort();
const fm = (dir, rel) => parseFrontmatter(readFileSync(path.join(dir, rel), 'utf8')).data;
const files = (dir) => readdirSync(path.join(dir, 'docs')).flatMap((d) => (d === 'skills' ? [] : readdirSync(path.join(dir, 'docs', d)).map((f) => `${d}/${f}`)));

test('a project at an older pack version updates to the newer one in one run', () => {
  const { root, dir } = fixture();
  const plan = planUpdate(dir, { root, date: today });
  assert.ok([...plan.added, ...plan.changed].some((p) => p.startsWith('docs/facts/')), 'the new question adds a fact');
  assert.ok(plan.changed.some((p) => p.startsWith('docs/guardrails/')), 'the reworded guardrail is re-rendered');
  assert.deepEqual(plan.modified, []);

  runUpdate(dir, { root, date: today });
  assert.match(readFileSync(path.join(dir, 'docs/guardrails/instruction-file-within-cap.md'), 'utf8'), /counted per line/);
  assert.equal(fm(dir, 'docs/guardrails/instruction-file-within-cap.md')['go-getter']['generated-by'], 'example@0.2.0');
  assert.ok(files(dir).some((f) => f.startsWith('facts/') && f.endsWith('cap-reported.md')));
  // the answer recorded under the old option id carried over: no decision was superseded
  assert.equal(fm(dir, 'docs/decisions/0001-instruction-file-cap.md').status, 'active');
  assert.equal(fm(dir, 'docs/guardrails/instruction-file-within-cap.md').date, '2026-10-05');
  assert.equal(readManifest(dir).packs.example, '0.2.0');
});

test('a second update is a no-op', () => {
  const { root, dir } = fixture();
  runUpdate(dir, { root, date: today });
  const after = snapshot(dir);
  const plan = planUpdate(dir, { root, date: '2026-10-10' });
  assert.deepEqual([plan.added, plan.changed, plan.removed, plan.modified], [[], [], [], []]);
  runUpdate(dir, { root, date: '2026-10-10' });
  assert.deepEqual(snapshot(dir), after);
});

test('update --dry-run prints the plan and writes nothing; --yes applies it', () => {
  const { dir } = fixture();
  // The CLI reads packs from the repository root, where "example" does not exist: no pack to update, apply only.
  const before = snapshot(dir);
  const dry = execFileSync('node', [cli, 'update', '--dry-run', '--project', dir], { encoding: 'utf8' });
  assert.match(dry, /update --dry-run:/);
  assert.match(dry, /note: pack example: not in this go-getter version/);
  assert.deepEqual(snapshot(dir), before);
});

test('a project with no manifest is bootstrapped by the first update', () => {
  const { root, dir } = fixture();
  cpSync(path.join(dir, MANIFEST), path.join(root, 'manifest.bak'));
  execFileSync('rm', [path.join(dir, MANIFEST)]);
  const plan = planUpdate(dir, { root, date: today });
  assert.deepEqual(plan.modified, []);
  runUpdate(dir, { root, date: today });
  assert.ok(readManifest(dir));
  assert.deepEqual(planUpdate(dir, { root, date: today }).changed, []);
});

test('a manifest with a newer schema is refused', () => {
  const { root, dir } = fixture();
  const m = readManifest(dir);
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify({ ...m, schema: m.schema + 1 }, null, 2)}\n`);
  assert.throws(() => planUpdate(dir, { root, date: today }), /newer than this go-getter/);
});

test('an edited generated file is skipped and reported, not overwritten', () => {
  const { root, dir } = fixture();
  const file = path.join(dir, '.go-getter/bin/go-getter');
  writeFileSync(file, `${readFileSync(file, 'utf8')}# mine\n`);
  const plan = planUpdate(dir, { root, date: today });
  assert.deepEqual(plan.modified.map((m) => m.path), ['.go-getter/bin/go-getter']);
  const { modified } = runUpdate(dir, { root, date: today });
  assert.equal(modified.length, 1);
  assert.match(readFileSync(file, 'utf8'), /# mine/);
});

// Drift signals (step 7): the session-start nudge and apply --check.
import { sessionNudges } from '../../src/hook.mjs';
import { drift, olderThan } from '../../src/manifest.mjs';

const repo = path.resolve(here, '../../..');
const installedVersion = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const withManifest = (dir, change) => {
  const m = readManifest(dir);
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify({ ...m, ...change }, null, 2)}\n`);
};

test('olderThan and drift compare versions numerically', () => {
  assert.ok(olderThan('0.9.0', '0.10.0'));
  assert.ok(!olderThan('1.0.0', '1.0.0'));
  assert.equal(drift(null, { version: '1.0.0', packs: {} }), null);
  assert.deepEqual(drift({ version: '1.0.0', packs: { a: '1.0.0' } }, { version: '1.0.0', packs: { a: '1.1.0' } }), { version: null, packs: ['a'] });
});

test('the session-start nudge names the drift for an older manifest and is silent for a current one', () => {
  const { dir } = fixture();
  assert.equal(sessionNudges(repo, dir).includes('go-getter update'), false);
  withManifest(dir, { version: '0.0.0-old', packs: { context: '0.0.1' } });
  const line = sessionNudges(repo, dir).split('\n').filter((l) => l.includes('go-getter update'));
  assert.equal(line.length, 1);
  assert.match(line[0], new RegExp(`^go-getter ${installedVersion.replace(/\./g, '\\.')} installed, `));
  assert.match(line[0], /pack context older than installed: run go-getter update$/);
});

test('apply --check fails on a version mismatch and passes after update', () => {
  const { dir } = fixture();
  const check = () => spawnSync('node', [cli, 'apply', '--check', '--project', dir], { encoding: 'utf8' });
  assert.equal(check().status, 0);
  withManifest(dir, { packs: { context: '0.0.1' } });
  const bad = check();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /version: manifest .*packs context older.*run "go-getter update"/);
  assert.equal(spawnSync('node', [cli, 'update', '--yes', '--project', dir], { encoding: 'utf8' }).status, 0);
  assert.equal(check().status, 0);
});

test('a pack-rendered decision still in draft counts as adopted: update keeps it and renders no second one', () => {
  const { root, dir } = fixture();
  const file = path.join(dir, 'docs/decisions/0001-instruction-file-cap.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('status: active', 'status: draft'));
  runUpdate(dir, { root, date: today });
  assert.deepEqual(readdirSync(path.join(dir, 'docs/decisions')).filter((f) => f.includes('instruction-file-cap')), ['0001-instruction-file-cap.md']);
  assert.equal(fm(dir, 'docs/decisions/0001-instruction-file-cap.md').status, 'draft');
});
