import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readLog, record, summarize } from '../src/telemetry/record.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

const RECORDING = `---\nid: 0051-rec\ntitle: rec\nstatus: active\ndate: 2026-11-05\ntags: [observability]\ntrack: process\ngo-getter:\n  telemetry-recording: "metadata-log"\n---\n\n## Decision\n\nx\n\n## Why\n\nx\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-guardrail-id-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/decisions/0051-rec.md'), RECORDING);
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  return dir;
}

function preTool(dir, command) {
  return spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'cursor', '--project', dir], { input: JSON.stringify({ tool_name: 'Shell', tool_input: { command } }), encoding: 'utf8' });
}

test('a denial carries the guardrail id on its pre-tool record and its gate:stop record', () => {
  const dir = project();
  try {
    const res = preTool(dir, 'git push origin main');
    assert.equal(res.status, 2);
    const log = readLog(dir);
    const denied = log.find((r) => r.event === 'pre-tool' && r.outcome === 'denied');
    const stop = log.find((r) => r.event === 'gate:stop');
    assert.equal(denied?.guardrail, 'gated-actions');
    assert.equal(stop?.guardrail, 'gated-actions');
    assert.equal(stop.outcome, 'blocked');
    assert.deepEqual(summarize(log).byGuardrail['gated-actions'], { 'pre-tool': 1, 'gate:stop': 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an allowed call records no guardrail', () => {
  const dir = project();
  try {
    assert.equal(preTool(dir, 'ls').status, 0);
    assert.ok(readLog(dir).every((r) => r.guardrail === undefined));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the validator accepts a guardrail id and refuses content-like values', () => {
  const base = { ts: '2026-11-05T00:00:00.000Z', event: 'pre-tool' };
  assert.deepEqual(validateRecord({ ...base, guardrail: 'gated-actions' }), []);
  assert.deepEqual(validateRecord(base), [], 'a record without the field stays valid');
  for (const bad of ['git push origin main', 'rm -rf /', '/etc/passwd', 'Gated-Actions', '', 'a'.repeat(65), 'x\ny', 5, null, ['a']]) {
    assert.equal(validateRecord({ ...base, guardrail: bad }).length, 1, JSON.stringify(bad));
  }
  const dir = project();
  try {
    assert.throws(() => record(dir, { event: 'pre-tool', guardrail: 'git push origin main' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('old records without the field still load and summarize', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-guardrail-id-'));
  try {
    mkdirSync(path.join(dir, '.go-getter/state'), { recursive: true });
    writeFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), event: 'pre-tool', outcome: 'denied' })}\n`);
    const log = readLog(dir);
    assert.equal(log.length, 1);
    assert.deepEqual(summarize(log).byGuardrail, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
