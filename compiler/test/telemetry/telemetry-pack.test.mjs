import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';
import { validateRecord } from '../../src/telemetry/schema.mjs';
import { record, prune, readLog, summarize, telemetryConfig, LOG } from '../../src/telemetry/record.mjs';
import { hookRecord } from '../../src/hook.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pack = loadPack(path.join(root, 'src/packs/telemetry/pack.json'));
const recommended = () => ({
  ...Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id])),
  retention: pack.questions.find((q) => q.id === 'retention').default,
});

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-telemetry-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nobservability — x\nharness — x\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const adopt = (dir, answers = recommended()) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-05' }) });
const days = (n) => new Date(Date.now() - n * 86400000);

test('the telemetry pack is valid and covers component 12', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'telemetry' }), []);
  assert.deepEqual(pack.components, [12]);
});

test('every answer renders, and the retention and endpoint questions are conditional', () => {
  for (const [rec, exp] of [['metadata-log', 'none'], ['host-otel', 'none'], ['off', 'otlp']]) {
    const dir = project();
    const answers = { recording: rec, export: exp, ...(rec === 'metadata-log' ? { retention: '7' } : {}), ...(exp === 'otlp' ? { 'otlp-endpoint': 'https://otel.example.com:4318' } : {}) };
    const plan = planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-05' });
    const slugs = plan.artifacts.map((a) => path.basename(a.path));
    assert.equal(slugs.some((s) => s.includes('retention')), rec === 'metadata-log');
    assert.equal(slugs.some((s) => s.includes('otlp-endpoint')), exp === 'otlp');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention and endpoint answers are checked against their patterns', () => {
  const dir = project();
  assert.throws(() => planRender({ root: dir, pack, answers: { ...recommended(), retention: '0' }, acceptedBy: 't' }), /does not match the pattern/);
  assert.throws(() => planRender({ root: dir, pack, answers: { ...recommended(), export: 'otlp', 'otlp-endpoint': 'not a url' }, acceptedBy: 't' }), /does not match the pattern/);
  rmSync(dir, { recursive: true, force: true });
});

test('the schema rejects a record carrying a content field', () => {
  const ok = { ts: new Date().toISOString(), event: 'route', model: 'model-a', tokens: { input: 10, cacheRead: 5 }, cost: 0.01, outcome: 'pass', escalations: 0 };
  assert.deepEqual(validateRecord(ok), []);
  for (const field of ['prompt', 'completion', 'content', 'file', 'toolOutput', 'tool_input']) {
    assert.match(validateRecord({ ...ok, [field]: 'secret' }).join(), /not an allowed metadata field/, field);
  }
  assert.match(validateRecord({ ...ok, tokens: { input: 1, text: 'x' } }).join(), /"tokens"/);
  assert.match(validateRecord({ ...ok, model: 'a long free text value that is clearly a prompt, not an identifier' }).join(), /"model"/);
  assert.match(validateRecord({ event: 'x' }).join(), /"ts" is required/);
});

test('record writes only when the adopted decision says metadata-log, and rejects content', () => {
  const dir = project();
  assert.equal(record(dir, { event: 'pre-tool' }), false, 'nothing adopted: off');
  adopt(dir);
  assert.deepEqual(telemetryConfig(dir), { recording: 'metadata-log', retentionDays: 30 });
  assert.equal(record(dir, { event: 'pre-tool', model: 'model-a', outcome: 'allowed' }), true);
  assert.throws(() => record(dir, { event: 'pre-tool', prompt: 'hello' }), /telemetry record rejected/);
  assert.deepEqual(readLog(dir).map((r) => r.event), ['pre-tool']);
  assert.ok(!readFileSync(path.join(dir, LOG), 'utf8').includes('hello'));
  rmSync(dir, { recursive: true, force: true });
});

test('other recording answers write nothing', () => {
  for (const recording of ['host-otel', 'off']) {
    const dir = project();
    adopt(dir, { recording, export: 'none' });
    assert.equal(record(dir, { event: 'pre-tool' }), false);
    assert.ok(!existsSync(path.join(dir, LOG)));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lines older than the retention are pruned on write', () => {
  const dir = project();
  adopt(dir, { ...recommended(), retention: '10' });
  record(dir, { event: 'old' }, { now: days(20) });
  record(dir, { event: 'edge' }, { now: days(9) });
  record(dir, { event: 'new' });
  assert.deepEqual(readLog(dir).map((r) => r.event), ['edge', 'new']);
  assert.equal(prune(dir, 1), 1);
  assert.deepEqual(readLog(dir).map((r) => r.event), ['new']);
  rmSync(dir, { recursive: true, force: true });
});

test('summary totals tokens, cost, outcomes and escalations', () => {
  const s = summarize([
    { ts: '2026-10-01T00:00:00.000Z', event: 'route', model: 'a', outcome: 'pass', tokens: { input: 10, output: 2 }, cost: 0.5, escalations: 1 },
    { ts: '2026-10-02T00:00:00.000Z', event: 'route', model: 'a', outcome: 'fail', tokens: { input: 5, cacheRead: 7 }, cost: 0.25 },
  ]);
  assert.deepEqual(s.tokens, { input: 15, cacheRead: 7, cacheWrite: 0, output: 2 });
  assert.equal(s.cost, 0.75);
  assert.deepEqual(s.outcomes, { pass: 1, fail: 1 });
  assert.deepEqual(s.models, { a: 2 });
  assert.equal(s.escalations, 1);
  assert.equal(summarize([]).records, 0);
});

test('hookRecord keeps metadata only and never tool input', () => {
  const rec = hookRecord('pre-tool', 'claude-code', { model: 'model-a', effort: 'high', tool_input: { command: 'cat secrets' }, prompt: 'p' }, { deny: true });
  assert.deepEqual(rec, { event: 'pre-tool', host: 'claude-code', model: 'model-a', effort: 'high', outcome: 'denied' });
  assert.deepEqual(hookRecord('pre-tool', 'cursor', { model: 'not an identifier!' }, { deny: false }), { event: 'pre-tool', host: 'cursor', outcome: 'allowed' });
  assert.deepEqual(validateRecord({ ts: new Date().toISOString(), ...rec }), []);
});

test('go-getter hook post-tool records the count of redactions and no content', () => {
  const dir = project();
  adopt(dir);
  const token = ['gh', 'p_'].join('') + 'Zx90'.repeat(9); // built at runtime: no literal token in this file
  const bin = path.join(root, 'compiler/bin/go-getter.mjs');
  const payload = { tool_name: 'Bash', tool_input: { command: 'deploy' }, tool_response: { stdout: `a ${token} b ${token}`, stderr: '' }, model: 'model-a' };
  assert.equal(spawnSync('node', [bin, 'hook', 'post-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(payload), encoding: 'utf8' }).status, 0);
  const log = readFileSync(path.join(dir, LOG), 'utf8');
  assert.ok(!log.includes(token) && !log.includes('deploy'));
  const [rec] = readLog(dir);
  assert.equal(rec.event, 'post-tool');
  assert.equal(rec.redactions, 2);
  assert.deepEqual(Object.keys(rec).sort(), ['event', 'host', 'masked', 'model', 'redactions', 'ts']);
  assert.deepEqual(rec.masked, { secret: 2 }, 'counts per kind, never what was masked');
  assert.deepEqual(validateRecord(rec), []);
  assert.ok(validateRecord({ ts: rec.ts, event: 'post-tool', redactions: 'two' }).length);
  rmSync(dir, { recursive: true, force: true });
});

test('go-getter hook pre-tool records an event and the summary command reports it', () => {
  const dir = project();
  adopt(dir);
  const bin = path.join(root, 'compiler/bin/go-getter.mjs');
  const run = spawnSync('node', [bin, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, model: 'model-a' }), encoding: 'utf8' });
  assert.equal(run.status, 0);
  const out = JSON.parse(execFileSync('node', [bin, 'telemetry', 'summary', '--project', dir], { encoding: 'utf8' }));
  assert.equal(out.records, 1);
  assert.deepEqual(out.events, { 'pre-tool': 1 });
  assert.deepEqual(out.models, { 'model-a': 1 });
  assert.equal(out.recording, 'metadata-log');
  rmSync(dir, { recursive: true, force: true });
});
