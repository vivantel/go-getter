// The Claude Code transcript reader (step 2 of docs/plans/archive/run-spend.md, fact 0037).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordTranscriptSpend } from '../src/spend/transcript.mjs';
import { recordHostSpend } from '../src/spend/index.mjs';
import { readLog } from '../src/telemetry/record.mjs';
import { startRun } from '../src/runs/record.mjs';
import { nextInRun } from '../src/runs/next.mjs';

const decision = (name, body) => `---\nid: ${name}\ntitle: ${name}\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n${body}---\n\nx\n`;
const fact = `---\nid: 0011-p\ntitle: p\nstatus: active\ndate: 2026-10-05\ntags: [cost]\ngo-getter:\n  models:\n    - {id: m-one, provider: acme, input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10}\n---\n\nx\n`;
const line = (id, model, u, extra = {}) => `${JSON.stringify({ type: 'assistant', message: { id, model, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...u }, content: [{ type: 'text', text: 'PRIVATE PROSE' }] }, ...extra })}\n`;

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-spendt-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/decisions/0001-t.md'), decision('0001-t', '  telemetry-recording: metadata-log\n'));
  writeFileSync(path.join(dir, 'docs/facts/0011-p.md'), fact);
  const transcript = path.join(base, 't.jsonl');
  writeFileSync(transcript, '');
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return { dir, transcript, cleanup: () => { saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved); rmSync(base, { recursive: true, force: true }); } };
}

test('a transcript is summed to the expected cost, with cache writes priced by their TTL', () => {
  const s = setup();
  try {
    appendFileSync(s.transcript, line('a', 'm-one', { input_tokens: 1000000, output_tokens: 100000, cache_read_input_tokens: 1000000, cache_creation_input_tokens: 1000000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000000 } }));
    assert.equal(recordTranscriptSpend(s.dir, 'claude-code', s.transcript).records, 1);
    const [r] = readLog(s.dir);
    assert.deepEqual(r.tokens, { input: 1000000, cacheRead: 1000000, cacheWrite: 1000000, output: 100000 });
    assert.equal(r.cost, 2 + 1 + 0.2 + 4); // input + output + read + 1h write, USD per MTok
    assert.equal(r.event, 'spend');
  } finally { s.cleanup(); }
});

test('a message written in several lines counts once, and a second read counts only new lines', () => {
  const s = setup();
  try {
    appendFileSync(s.transcript, line('a', 'm-one', { output_tokens: 1000000 }) + line('a', 'm-one', { output_tokens: 1000000 }));
    recordTranscriptSpend(s.dir, 'claude-code', s.transcript);
    assert.equal(readLog(s.dir)[0].cost, 10);
    assert.equal(recordTranscriptSpend(s.dir, 'claude-code', s.transcript).records, 0);
    appendFileSync(s.transcript, line('a', 'm-one', { output_tokens: 1000000 }) + line('b', 'm-one', { output_tokens: 1000000 }));
    recordTranscriptSpend(s.dir, 'claude-code', s.transcript);
    const log = readLog(s.dir);
    assert.equal(log.length, 2);
    assert.equal(log[1].cost, 10); // only b: a was already counted
  } finally { s.cleanup(); }
});

test('a model with no price records tokens only; a malformed or half-written line does not fail the read', () => {
  const s = setup();
  try {
    appendFileSync(s.transcript, `not json\n${line('a', 'other-model', { output_tokens: 5 })}{"type":"assist`);
    const r = recordTranscriptSpend(s.dir, 'claude-code', s.transcript);
    assert.equal(r.skipped, 1);
    const [rec] = readLog(s.dir);
    assert.equal(rec.model, 'other-model');
    assert.equal(rec.cost, undefined);
    assert.equal(rec.tokens.output, 5);
    appendFileSync(s.transcript, 'ant","message":{"id":"z","model":"m-one","usage":{"output_tokens":1000000}}}\n');
    recordTranscriptSpend(s.dir, 'claude-code', s.transcript);
    assert.equal(readLog(s.dir).at(-1).cost, 10); // the half line was completed and read
  } finally { s.cleanup(); }
});

test('no transcript text reaches the log, and a relative or missing path records nothing', () => {
  const s = setup();
  try {
    appendFileSync(s.transcript, line('a', 'm-one', { output_tokens: 1 }));
    recordTranscriptSpend(s.dir, 'claude-code', s.transcript);
    assert.doesNotMatch(readFileSync(path.join(s.dir, '.go-getter/state/telemetry.jsonl'), 'utf8'), /PRIVATE PROSE/);
    assert.deepEqual(recordTranscriptSpend(s.dir, 'claude-code', 'relative.jsonl'), { records: 0, skipped: 0 });
    assert.deepEqual(recordTranscriptSpend(s.dir, 'claude-code', path.join(s.dir, 'missing.jsonl')), { records: 0, skipped: 0 });
    assert.deepEqual(recordHostSpend(s.dir, 'cursor', { transcript_path: s.transcript }), { records: 0, skipped: 0 });
  } finally { s.cleanup(); }
});

test('run next stops on spend-cap from the recorded spend', () => {
  const s = setup();
  try {
    mkdirSync(path.join(s.dir, 'docs/plans'), { recursive: true });
    writeFileSync(path.join(s.dir, 'docs/plans/p.md'), '# P — plan\n\n**Status legend**: x\n\n### 1 One — [ ]\nIssue: #1\nClass: implement · Effort: low · Needs: none · Check: `true`\nDo: x.\nDone-when: x.\n');
    startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['1'], spendCapUsd: 5, grants: [] });
    appendFileSync(s.transcript, line('a', 'm-one', { output_tokens: 1000000 }));
    assert.ok(nextInRun(s.dir, { record: false }).step);
    appendFileSync(s.transcript, line('b', 'm-one', { output_tokens: 1000000 }));
    recordHostSpend(s.dir, 'claude-code', { transcript_path: s.transcript });
    assert.equal(nextInRun(s.dir, { record: false }).stop.code, 'spend-cap');
  } finally { s.cleanup(); }
});
