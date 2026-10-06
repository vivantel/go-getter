import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadPack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';
import { calibrate, failureSamples, idleGaps } from '../../src/routing/calibrate.mjs';
import { chooseRoute, loadPolicy, loadRoutingFacts, routingInputs } from '../../src/routing/policy.mjs';
import { LOG } from '../../src/telemetry/record.mjs';
import { validateRecord } from '../../src/telemetry/schema.mjs';
import { parseFrontmatter } from '../../src/frontmatter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bin = path.join(root, 'compiler/bin/go-getter.mjs');
const fixture = path.join(root, 'compiler/test/fixtures/telemetry/calibration.jsonl');
const records = readFileSync(fixture, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const FACTS = ['0011-model-pricing-anthropic', '0012-model-pricing-openai', '0013-model-pricing-google', '0024-model-tiers-and-host-providers'];
const recommended = (p) => Object.fromEntries(p.questions.map((q) => [q.id, q.options ? q.options.find((o) => o.recommended).id : q.default]).filter(([, v]) => v !== undefined));

function project() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-calibrate-')));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nmodel-routing — x\ncost — x\nguardrail — x\nobservability — x\nharness — x\n');
  for (const f of FACTS) copyFileSync(path.join(root, 'docs/facts', `${f}.md`), path.join(dir, 'docs/facts', `${f}.md`));
  const adopt = (id, answers) => applyRender({ root: dir, plan: planRender({ root: dir, pack: loadPack(path.join(root, `src/packs/${id}/pack.json`)), answers, acceptedBy: 't', date: '2026-10-06' }) });
  adopt('telemetry', { recording: 'metadata-log', retention: '30', export: 'none' });
  adopt('cost-routing', recommended(loadPack(path.join(root, 'src/packs/cost-routing/pack.json'))));
  mkdirSync(path.dirname(path.join(dir, LOG)), { recursive: true });
  copyFileSync(fixture, path.join(dir, LOG));
  return dir;
}
const run = (...args) => spawnSync('node', [bin, 'routing', ...args], { encoding: 'utf8' });
const decisions = (dir) => readdirSync(path.join(dir, 'docs/decisions')).filter((n) => n.endsWith('-routing-calibration.md'));

test('the fixture log holds metadata only', () => {
  for (const r of records) assert.deepEqual(validateRecord(r), [], JSON.stringify(r));
});

test('a route takes the verification outcome of its class until the next route of that class', () => {
  const tiers = { small: ['s'], medium: ['m'] };
  const ts = (m) => new Date(Date.UTC(2026, 8, 1, 9, m)).toISOString();
  const log = [
    { ts: ts(0), event: 'route', model: 's', taskClass: 'explore' },
    { ts: ts(1), event: 'verify:test', taskClass: 'explore', outcome: 'pass' },
    { ts: ts(2), event: 'verify:lint', taskClass: 'explore', outcome: 'fail' },
    { ts: ts(3), event: 'route', model: 'm', taskClass: 'implement' },
    { ts: ts(4), event: 'verify:test', taskClass: 'plan', outcome: 'fail' },
    { ts: ts(5), event: 'route', model: 's', taskClass: 'explore' },
  ];
  const samples = failureSamples(log, tiers);
  assert.deepEqual(samples.small, { n: 1, fails: 1 }, 'one failing check fails the step; a route without an outcome is no sample');
  assert.deepEqual(samples.medium, { n: 0, fails: 0 }, 'another class\'s outcome is not attributed');
});

test('a fixture telemetry log yields calibrated failure rates, step shape and idle advice', () => {
  const dir = project();
  const { models, tiers } = loadRoutingFacts(dir);
  const result = calibrate({ records, tiers, models, policy: loadPolicy(dir) });
  assert.deepEqual(result.proposal, { 'failure-rates': { small: 0.6, medium: 0, large: 0.05 }, step: { turns: 3, 'new-tokens': 3000, 'output-tokens': 800 } });
  assert.equal(result.failureRates.samples.large.n, 0, 'too few samples keep the current rate');
  assert.equal(result.idle.model, 'claude-haiku-4-5');
  assert.equal(result.idle.ttl, '1h');
  assert.deepEqual([result.idle.gaps, result.idle.keepWarmWouldPay, result.idleAdvice], [14, 14, true]);
  const strict = calibrate({ records, tiers, models, policy: loadPolicy(dir), minSamples: 100 });
  assert.deepEqual([strict.proposal, strict.idleAdvice], [null, false], 'below the sample floor nothing is proposed');
  rmSync(dir, { recursive: true, force: true });
});

test('keeping the cache warm pays only while the reads cost less than the cold write', () => {
  const model = { id: 'x', input: 1, cache_read: 0.1, cache_write_1h: 2 };
  const at = (h) => new Date(Date.UTC(2026, 8, 1) + h * 3600000).toISOString();
  const short = idleGaps([{ ts: at(0) }, { ts: at(2) }], model, '1h');
  assert.deepEqual([short.gaps, short.keepWarmWouldPay], [1, 1]);
  const long = idleGaps([{ ts: at(0) }, { ts: at(30) }], model, '1h');
  assert.deepEqual([long.gaps, long.keepWarmWouldPay, long.savingUsdPer100kPrefix], [1, 0, 0], '30 reads at 0.1 cost more than the 1.9 a warm resume saves');
});

test('routing calibrate writes the proposal as a draft decision and never applies it', () => {
  const dir = project();
  const log = readFileSync(path.join(dir, LOG), 'utf8');
  const before = loadPolicy(dir);
  const dry = run('calibrate', '--project', dir, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).draft, null);
  assert.deepEqual(decisions(dir), [], '--dry-run writes nothing');

  const out = run('calibrate', '--project', dir);
  assert.equal(out.status, 0, out.stderr);
  const draft = JSON.parse(out.stdout).draft;
  assert.ok(draft && existsSync(path.join(dir, draft)));
  const { data, body } = parseFrontmatter(readFileSync(path.join(dir, draft), 'utf8'));
  assert.equal(data.status, 'draft');
  assert.deepEqual(data['go-getter']['routing-calibration']['failure-rates'], { small: 0.6, medium: 0, large: 0.05 });
  assert.match(body, /0074/, 'the idle advice is part of the proposal');
  assert.match(readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8'), new RegExp(`${data.id},.*,draft\\n`));
  assert.deepEqual(loadPolicy(dir), before, 'a draft changes nothing');
  assert.equal(readFileSync(path.join(dir, LOG), 'utf8'), log);

  // Only a human activating the draft makes routing use it.
  writeFileSync(path.join(dir, draft), readFileSync(path.join(dir, draft), 'utf8').replace('status: draft', 'status: active'));
  const after = loadPolicy(dir);
  assert.deepEqual(after.failureRates, { small: 0.6, medium: 0, large: 0.05 });
  assert.deepEqual(after.step, { turns: 3, newTokens: 3000, outputTokens: 800 });
  const inputs = routingInputs(dir, 'claude-code');
  const step = { sessionTokens: 0, handoffTokens: 4000, cache: 'cold' };
  const calibrated = chooseRoute({ ...inputs, taskClass: 'explore', step });
  const shipped = chooseRoute({ ...inputs, policy: before, taskClass: 'explore', step });
  assert.notEqual(calibrated.expectedCost, shipped.expectedCost, 'the calibrated values price the step');

  const next = run('calibrate', '--project', dir);
  const second = parseFrontmatter(readFileSync(path.join(dir, JSON.parse(next.stdout).draft), 'utf8')).data;
  assert.equal(second.supersedes, data.id, 'a new proposal supersedes the active calibration');
  rmSync(dir, { recursive: true, force: true });
});

test('routing calibrate needs the cost-routing pack and a known subcommand', () => {
  const bare = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-calibrate-')));
  assert.equal(run('calibrate', '--project', bare).status, 2);
  assert.equal(run('tune', '--project', bare).status, 2);
  rmSync(bare, { recursive: true, force: true });
});
