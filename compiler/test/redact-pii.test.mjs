import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluatePostTool, evaluateSessionEnd, respondPostTool, hookRecord } from '../src/hook.mjs';
import { piiConfig, sessionKeyOf } from '../src/secrets/mask.mjs';
import { PSEUDONYM_DIR } from '../src/secrets/pseudonyms.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';
import { planApply } from '../src/apply.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const GHP = 'ghp_' + 'a1B2'.repeat(9); // built from parts: this file is scanned for secrets
const STATE = '.go-getter';

function guardrail(id, run) {
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: "${run}"\n    - tier: 1\n      check: "instruction"\n---\n\n## Guardrail\n\nAdvisory.\n`;
}
function project({ classes = 'email,card,iban' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-redact-pii-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# P\n');
  if (classes !== null) writeFileSync(path.join(dir, 'docs/guardrails/pii-masked.md'), guardrail('pii-masked', `builtin:redact-pii classes=\\"${classes}\\"`));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const call = (dir, response, session = 's1') => evaluatePostTool(dir, { session_id: session, tool_name: 'Bash', tool_response: response });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });
const mapFiles = (dir) => (existsSync(path.join(dir, PSEUDONYM_DIR)) ? readdirSync(path.join(dir, PSEUDONYM_DIR)).filter((f) => f.endsWith('.json')) : []);

test('piiConfig reads the adopted classes, and is null without the guardrail', () => {
  const on = project({ classes: 'email, phone ,bogus' });
  const off = project({ classes: null });
  try {
    assert.deepEqual(piiConfig(on), { classes: ['email', 'phone'] });
    assert.equal(piiConfig(off), null);
  } finally {
    cleanup(on);
    cleanup(off);
  }
});

test('the session key is whatever the host calls it, else a project-wide key', () => {
  assert.equal(sessionKeyOf({ session_id: 'a' }), 'a');
  assert.equal(sessionKeyOf({ sessionId: 'b' }), 'b');
  assert.equal(sessionKeyOf({ sessionID: 'c' }), 'c');
  assert.equal(sessionKeyOf({ conversation_id: 'd' }), 'd');
  assert.equal(sessionKeyOf({}), 'project');
  assert.equal(sessionKeyOf({ session_id: 42 }), 'project');
});

test('the same email keeps its name across calls, a new one takes the next, and another session restarts', () => {
  const dir = project();
  try {
    const first = call(dir, 'mail alice@example.com, bob@example.com, alice@example.com');
    assert.equal(first.output, 'mail [email-1], [email-2], [email-1]');
    assert.deepEqual(first.masked, { email: 3 });
    assert.equal(first.redactions, 3);
    assert.equal(call(dir, 'bob@example.com and carol@example.com').output, '[email-2] and [email-3]');
    assert.equal(call(dir, 'alice@example.com', 's2').output, '[email-1]');
  } finally {
    cleanup(dir);
  }
});

test('names follow the order of first appearance in a text, not the order they are replaced in', () => {
  const dir = project();
  try {
    assert.equal(call(dir, 'alice@example.com then bob@example.com then carol@example.com').output, '[email-1] then [email-2] then [email-3]');
  } finally {
    cleanup(dir);
  }
});

test('cards and IBANs are named by kind, secrets keep the one marker, and the shape of the result is kept', () => {
  const dir = project();
  try {
    const r = call(dir, { stdout: `card 4111111111111111 iban GB82WEST12345698765432 key ${GHP}`, code: 0, lines: ['x bob@example.com'] });
    assert.equal(r.output.stdout, 'card [card-1] iban [iban-1] key [redacted by go-getter]');
    assert.equal(r.output.code, 0);
    assert.deepEqual(r.output.lines, ['x [email-1]']);
    assert.deepEqual(r.masked, { secret: 1, card: 1, iban: 1, email: 1 });
    assert.equal(r.redactions, 4);
  } finally {
    cleanup(dir);
  }
});

test('phone numbers and national ids are masked only when the project lists them', () => {
  const plain = project();
  const extra = project({ classes: 'email,phone,national-id' });
  try {
    const text = 'call +44 20 7946 0958 ssn 123-45-6789';
    assert.equal(call(plain, text).output, text);
    assert.equal(call(extra, text).output, 'call [phone-1] ssn [national-id-1]');
  } finally {
    cleanup(plain);
    cleanup(extra);
  }
});

test('without the guardrail PII is left alone, secrets are still redacted, and no state is written', () => {
  const dir = project({ classes: null });
  try {
    const r = call(dir, `alice@example.com ${GHP}`);
    assert.equal(r.output, 'alice@example.com [redacted by go-getter]');
    assert.equal(existsSync(path.join(dir, STATE)), false);
  } finally {
    cleanup(dir);
  }
});

test('the host answer replaces the result only when something was masked', () => {
  const dir = project();
  try {
    const masked = respondPostTool('claude-code', call(dir, 'bob@example.com'));
    assert.deepEqual(JSON.parse(masked.stdout).hookSpecificOutput.updatedToolOutput, '[email-1]');
    assert.equal(respondPostTool('claude-code', call(dir, 'nothing to hide')).stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('a session end deletes the map, so numbering restarts', () => {
  const dir = project();
  try {
    call(dir, 'alice@example.com bob@example.com');
    assert.equal(call(dir, 'bob@example.com').output, '[email-2]');
    evaluateSessionEnd(dir, { session_id: 's1' });
    assert.equal(call(dir, 'bob@example.com').output, '[email-1]');
  } finally {
    cleanup(dir);
  }
});

test('the telemetry line carries counts per kind and never a value', () => {
  const rec = hookRecord('post-tool', 'claude-code', { session_id: 's1', tool_response: 'alice@example.com' }, undefined, 3, { email: 2, card: 1 });
  const stamped = { ts: new Date().toISOString(), ...rec };
  assert.deepEqual(validateRecord(stamped), []);
  assert.deepEqual(rec.masked, { email: 2, card: 1 });
  assert.ok(!JSON.stringify(rec).includes('alice'));
  assert.notDeepEqual(validateRecord({ ...stamped, masked: { email: 'alice@example.com' } }), []);
  assert.notDeepEqual(validateRecord({ ...stamped, masked: { 'alice@example.com': 1 } }), []);
  assert.notDeepEqual(validateRecord({ ...stamped, masked: {} }), []);
});

test('the post-tool command answers with the pseudonym, no state file holds the value, and session-end clears the map', () => {
  const dir = project();
  try {
    const payload = JSON.stringify({ session_id: 's9', cwd: dir, tool_name: 'Bash', tool_response: 'bob@example.com wrote' });
    const r = spawnSync(process.execPath, [cli, 'hook', 'post-tool', '--host', 'claude-code', '--project', dir], { input: payload, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput, '[email-1] wrote');
    const stateFiles = [];
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : stateFiles.push(path.join(d, e.name))));
    walk(path.join(dir, STATE));
    assert.ok(stateFiles.length >= 1, 'at least the map');
    for (const f of stateFiles) assert.ok(!readFileSync(f, 'utf8').includes('bob@example.com'), f);
    assert.equal(mapFiles(dir).length, 1);
    const end = spawnSync(process.execPath, [cli, 'hook', 'session-end', '--host', 'claude-code', '--project', dir], { input: JSON.stringify({ session_id: 's9', cwd: dir }), encoding: 'utf8' });
    assert.equal(end.status, 0);
    assert.equal(mapFiles(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('apply registers the post-tool and session-end hooks where the host has them, and no pre-tool hook for masking alone', () => {
  const dir = project();
  const none = project({ classes: null });
  try {
    const out = planApply(dir, { hosts: ['claude-code', 'codex', 'gemini-cli', 'copilot', 'cursor', 'kilo', 'opencode'] }).outputs;
    const hooks = (rel) => JSON.parse(out[rel].content).hooks;
    for (const [rel, post, end] of [['.claude/settings.json', 'PostToolUse', 'SessionEnd'], ['.codex/hooks.json', 'PostToolUse', 'SessionEnd'], ['.gemini/settings.json', 'AfterTool', 'SessionEnd']]) {
      assert.ok(hooks(rel)[post], `${rel} ${post}`);
      assert.match(JSON.stringify(hooks(rel)[end]), /hook session-end --host/, `${rel} ${end}`);
    }
    assert.equal(hooks('.claude/settings.json').PreToolUse, undefined, 'masking alone installs no pre-tool hook');
    const copilot = hooks('.github/hooks/go-getter.json');
    assert.ok(copilot.postToolUse && copilot.sessionEnd);
    assert.equal(out['.cursor/hooks.json'], undefined, 'Cursor cannot replace tool output');
    const kilo = out['.kilo/plugin/go-getter.js'].content;
    assert.match(kilo, /tool\.execute\.after/);
    assert.match(kilo, /session_id: input\.sessionID/);
    assert.equal(out['.opencode/plugins/go-getter.js'], undefined, 'OpenCode cannot replace tool output');
    const off = planApply(none, { hosts: ['claude-code'] }).outputs['.claude/settings.json'];
    assert.ok(off === undefined || !JSON.stringify(JSON.parse(off.content).hooks ?? {}).includes('session-end'));
  } finally {
    cleanup(dir);
    cleanup(none);
  }
});
