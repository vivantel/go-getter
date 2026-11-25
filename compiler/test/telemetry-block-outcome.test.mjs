import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readLog } from '../src/telemetry/record.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';
import { namedFix, summarizeBlocks, summarizeHookErrors } from '../src/telemetry/block-outcome.mjs';
import { dayReport } from '../src/metrics/day.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;
const RECORDING = `---\nid: 0051-rec\ntitle: rec\nstatus: active\ndate: 2026-11-05\ntags: [observability]\ntrack: process\ngo-getter:\n  telemetry-recording: "metadata-log"\n---\n\n## Decision\n\nx\n\n## Why\n\nx\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-block-outcome-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/decisions/0051-rec.md'), RECORDING);
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  return dir;
}
const preTool = (dir, command, session = 's1') =>
  spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'cursor', '--project', dir], { input: JSON.stringify({ session_id: session, tool_name: 'Shell', tool_input: { command } }), encoding: 'utf8' });

test('namedFix reads the verb a refusal names, never keeps text beyond a slug', () => {
  assert.deepEqual(namedFix('blocked: covered by `go-getter ship`; run that'), { fix: 'go-getter-ship', verb: 'go-getter ship' });
  assert.equal(namedFix('this needs a human: ask the user').fix, 'ask-user');
  assert.equal(namedFix('something else').fix, 'none');
  assert.equal(namedFix(undefined).fix, 'none');
});

test('a block:outcome record needs guardrail, hook and resolution and rejects free text', () => {
  const ok = { ts: new Date().toISOString(), event: 'block:outcome', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'go-getter-ship', resolution: 'fixed-by-verb' };
  assert.deepEqual(validateRecord(ok), []);
  assert.ok(validateRecord({ ...ok, resolution: undefined, ...{} }).length);
  assert.ok(validateRecord({ ...ok, resolution: 'git push origin main' }).length);
  assert.ok(validateRecord({ ...ok, fix: 'git push origin main' }).length);
  assert.ok(validateRecord({ ts: ok.ts, event: 'pre-tool', resolution: 'abandoned' }).length);
});

test('a denial is logged with hook and fix; the next other call settles it as abandoned; no command text is logged', () => {
  const dir = project();
  try {
    assert.equal(preTool(dir, 'git push origin SECRETBRANCH').status, 2);
    const stop = readLog(dir).find((r) => r.event === 'gate:stop');
    assert.equal(stop.hook, 'pre-tool');
    assert.equal(stop.guardrail, 'gated-actions');
    assert.ok(stop.fix);
    preTool(dir, 'ls');
    const out = readLog(dir).find((r) => r.event === 'block:outcome');
    assert.equal(out.resolution, 'abandoned');
    assert.equal(out.guardrail, 'gated-actions');
    assert.ok(!readFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), 'utf8').includes('SECRETBRANCH'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('summarizeBlocks and metrics day print per guardrail and hook: blocks, fix named, resolution, retry result', () => {
  const day = '2026-11-24';
  const recs = [
    { ts: `${day}T10:00:00.000Z`, event: 'gate:stop', outcome: 'blocked', trigger: 'deny', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'go-getter-ship' },
    { ts: `${day}T10:00:05.000Z`, event: 'block:outcome', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'go-getter-ship', resolution: 'fixed-by-verb' },
    { ts: `${day}T11:00:00.000Z`, event: 'gate:stop', outcome: 'blocked', trigger: 'deny', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'none' },
    { ts: `${day}T11:00:05.000Z`, event: 'block:outcome', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'none', resolution: 'abandoned' },
    { ts: '2026-11-23T11:00:05.000Z', event: 'block:outcome', guardrail: 'gated-actions', hook: 'pre-tool', fix: 'none', resolution: 'abandoned' },
  ];
  assert.deepEqual(summarizeBlocks(recs, day), { 'gated-actions/pre-tool': { blocks: 2, fixNamed: { 'go-getter-ship': 1, none: 1 }, resolutions: { 'fixed-by-verb': 1, abandoned: 1 }, retrySucceeded: 1 } });
  const dir = project();
  try {
    mkdirSync(path.join(dir, '.go-getter/state'), { recursive: true });
    writeFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const report = dayReport(dir, day, { exec: () => '[]', home: dir });
    assert.equal(report.blocks['gated-actions/pre-tool'].retrySucceeded, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hook that fails is logged with its hook id and a trigger slug, never the error text, and metrics day counts it', () => {
  const dir = project();
  try {
    for (const event of ['pre-tool', 'user-prompt', 'post-tool']) {
      spawnSync(process.execPath, [cli, 'hook', event, '--host', 'cursor', '--project', dir], { input: 'not json SECRET-TEXT', encoding: 'utf8' });
    }
    const errors = readLog(dir).filter((r) => r.event === 'hook:error');
    assert.deepEqual(errors.map((r) => `${r.hook}/${r.trigger}`).sort(), ['post-tool/unreadable-payload', 'pre-tool/unreadable-payload', 'user-prompt/unreadable-payload']);
    for (const r of errors) assert.deepEqual(validateRecord(r), []);
    assert.ok(!readFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), 'utf8').includes('SECRET-TEXT'));
    const day = errors[0].ts.slice(0, 10);
    assert.deepEqual(summarizeHookErrors(readLog(dir), day), { 'post-tool/unreadable-payload': 1, 'pre-tool/unreadable-payload': 1, 'user-prompt/unreadable-payload': 1 });
    assert.deepEqual(dayReport(dir, day, { exec: () => '[]', home: dir }).hookErrors, { 'post-tool/unreadable-payload': 1, 'pre-tool/unreadable-payload': 1, 'user-prompt/unreadable-payload': 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('summarizeHookErrors counts one day only', () => {
  const recs = [
    { ts: '2026-11-24T10:00:00.000Z', event: 'hook:error', hook: 'stop', trigger: 'exception' },
    { ts: '2026-11-24T11:00:00.000Z', event: 'hook:error', hook: 'stop', trigger: 'exception' },
    { ts: '2026-11-23T11:00:00.000Z', event: 'hook:error', hook: 'stop', trigger: 'exception' },
  ];
  assert.deepEqual(summarizeHookErrors(recs, '2026-11-24'), { 'stop/exception': 2 });
});
