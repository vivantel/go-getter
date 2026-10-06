import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';
import { planApply, writeApply, diffApply } from '../../src/apply.mjs';
import { HOSTS } from '../../src/capabilities.mjs';
import { readLog, summarize } from '../../src/telemetry/record.mjs';
import { validateRecord } from '../../src/telemetry/schema.mjs';
import { hookRecord, payloadUsage } from '../../src/hook.mjs';
import { DEFAULT_ENDPOINT } from '../../src/telemetry/otel.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pack = loadPack(path.join(root, 'src/packs/telemetry/pack.json'));
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

function project(answers) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-otel-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nobservability — x\nharness — x\n');
  mkdirSync(path.join(dir, '.gemini'), { recursive: true });
  writeFileSync(path.join(dir, '.gemini/settings.json'), JSON.stringify({ telemetry: { outfile: 'keep.log' }, ui: { theme: 'x' } }));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-06' }) });
  return dir;
}

test('host-otel emits Gemini CLI settings and marks every other host unavailable', () => {
  const dir = project({ recording: 'host-otel', export: 'none' });
  const plan = planApply(dir, { hosts: HOSTS, skills: false });
  assert.deepEqual(Object.keys(plan.otel).sort(), [...HOSTS].sort());
  assert.deepEqual(plan.otel['gemini-cli'], { status: 'emitted', file: '.gemini/settings.json' });
  for (const h of HOSTS.filter((x) => x !== 'gemini-cli')) {
    assert.equal(plan.otel[h].status, 'unavailable', h);
    assert.ok(plan.otel[h].reason, h);
  }
  assert.match(plan.otel['claude-code'].reason, /user or managed settings only/);
  assert.match(plan.otel.codex.reason, /user config only/);
  const gemini = JSON.parse(plan.outputs['.gemini/settings.json'].content);
  assert.deepEqual(gemini.telemetry, { outfile: 'keep.log', enabled: true, target: 'local', otlpEndpoint: DEFAULT_ENDPOINT, otlpProtocol: 'http', logPrompts: false });
  assert.equal(gemini.ui.theme, 'x', 'unrelated settings are kept');
  const others = Object.entries(plan.outputs).filter(([p, o]) => p !== '.gemini/settings.json' && 'content' in o);
  assert.ok(!others.some(([, o]) => /OTEL_|ENABLE_TELEMETRY|\[otel\]/.test(o.content)), 'nothing written for unavailable hosts');
  writeApply(dir, plan);
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts: HOSTS, skills: false })), [], 'a second run is clean');
  rmSync(dir, { recursive: true, force: true });
});

test('the OTLP export answer uses the adopted endpoint; no answer for either writes nothing', () => {
  const dir = project({ recording: 'metadata-log', retention: '30', export: 'otlp', 'otlp-endpoint': 'https://otel.example.com:4318' });
  const plan = planApply(dir, { hosts: ['gemini-cli'], skills: false });
  assert.equal(JSON.parse(plan.outputs['.gemini/settings.json'].content).telemetry.otlpEndpoint, 'https://otel.example.com:4318');
  const out = spawnSync(process.execPath, [cli, 'apply', '--project', dir, '--hosts', 'gemini-cli,cursor', '--no-skills'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /otel gemini-cli: emitted in \.gemini\/settings\.json/);
  assert.match(out.stdout, /otel cursor: unavailable \(no OpenTelemetry export documented\)/);
  rmSync(dir, { recursive: true, force: true });

  const off = project({ recording: 'metadata-log', retention: '30', export: 'none' });
  const plain = planApply(off, { hosts: HOSTS, skills: false });
  assert.equal(plain.otel, null);
  assert.equal(JSON.parse(plain.outputs['.gemini/settings.json'].content).telemetry.enabled, undefined);
  rmSync(off, { recursive: true, force: true });
});

test('token and cost fields come from the resume data of a Claude Code session-start payload', () => {
  assert.deepEqual(payloadUsage({ context_tokens: 1000, prompt_cache_likely_expired: true, estimated_cache_write_usd: 0.5 }), { tokens: { cacheWrite: 1000 }, cost: 0.5 });
  assert.deepEqual(payloadUsage({ context_tokens: 1000, prompt_cache_likely_expired: false }), { tokens: { cacheRead: 1000 } });
  assert.deepEqual(payloadUsage({ model: 'x' }), {});
  assert.deepEqual(payloadUsage({ context_tokens: 'many' }), {});
  const rec = hookRecord('session-start', 'claude-code', { model: 'model-a', context_tokens: 9, prompt_cache_likely_expired: true, estimated_cache_write_usd: 0.01, source: 'resume' });
  assert.deepEqual(rec, { event: 'session-start', host: 'claude-code', model: 'model-a', tokens: { cacheWrite: 9 }, cost: 0.01 });
  assert.deepEqual(validateRecord({ ts: new Date().toISOString(), ...rec }), []);
});

test('go-getter hook session-start records the payload metadata', () => {
  const dir = project({ recording: 'metadata-log', retention: '30', export: 'none' });
  const payload = { model: 'model-a', source: 'resume', context_tokens: 50, prompt_cache_likely_expired: true, estimated_cache_write_usd: 0.2, transcript_path: '/x' };
  const res = spawnSync(process.execPath, [cli, 'hook', 'session-start', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const [rec] = readLog(dir);
  assert.deepEqual({ ...rec, ts: undefined }, { ts: undefined, event: 'session-start', host: 'claude-code', model: 'model-a', tokens: { cacheWrite: 50 }, cost: 0.2 });
  rmSync(dir, { recursive: true, force: true });
});

test('the summary shows cost by task class', () => {
  const s = summarize([
    { ts: '2026-10-01T00:00:00.000Z', event: 'route', taskClass: 'implement', cost: 0.5 },
    { ts: '2026-10-01T00:00:01.000Z', event: 'route', taskClass: 'implement', cost: 0.25 },
    { ts: '2026-10-01T00:00:02.000Z', event: 'route', taskClass: 'review', cost: 0.1 },
    { ts: '2026-10-01T00:00:03.000Z', event: 'session-start', cost: 0.2 },
    { ts: '2026-10-01T00:00:04.000Z', event: 'pre-tool', taskClass: 'explore' },
  ]);
  assert.deepEqual(s.costByTaskClass, { implement: 0.75, review: 0.1, unclassified: 0.2 });
});
