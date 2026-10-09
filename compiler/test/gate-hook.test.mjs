import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluatePreTool, respond } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

function project(gate = 'builtin:gate-command classes=irreversible,outward') {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gatehook-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets-dir.md'), guardrail('no-secrets-dir', 'builtin:deny-path paths=secrets/**'));
  if (gate) writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', gate));
  return dir;
}

// A shell call in each host's payload shape (fact 0031 for the tool names).
const SHELL = {
  cursor: (command) => ({ tool_name: 'Shell', tool_input: { command } }),
  codex: (command) => ({ tool_name: 'Bash', tool_input: { command } }),
  'gemini-cli': (command) => ({ tool_name: 'run_shell_command', tool_input: { command } }),
  copilot: (command) => ({ toolName: 'bash', toolArgs: JSON.stringify({ command }) }),
  'claude-code': (command) => ({ tool_name: 'Bash', tool_input: { command } }),
  kilo: (command) => ({ tool_name: 'bash', tool_input: { command } }),
  opencode: (command) => ({ tool_name: 'bash', tool_input: { command } }),
};
const HAND_OVER = ['cursor', 'codex', 'gemini-cli', 'copilot'];
const NATIVE = ['claude-code', 'kilo', 'opencode'];

test('a gated command is denied on the hand-over hosts, in each host format', () => {
  const dir = project();
  for (const host of HAND_OVER) {
    const decision = evaluatePreTool(dir, SHELL[host]('git push origin main'), host);
    assert.equal(decision.deny, true, host);
    assert.equal(decision.reason, 'blocked by guardrail gated-actions: "git push origin main" is an outward command and needs a human; ask the user to run it themselves');
    const out = respond(host, decision);
    if (host === 'copilot') assert.equal(JSON.parse(out.stdout).permissionDecision, 'deny');
    else assert.equal(out.code, 2);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('the hosts with native ask rules are never gated by the hook', () => {
  const dir = project();
  for (const host of NATIVE) assert.equal(evaluatePreTool(dir, SHELL[host]('git push --force'), host).deny, false, host);
  rmSync(dir, { recursive: true, force: true });
});

test('the class of the first match is named', () => {
  const dir = project();
  assert.match(evaluatePreTool(dir, SHELL.cursor('git push --force'), 'cursor').reason, /is an irreversible command/);
  rmSync(dir, { recursive: true, force: true });
});

test('ordinary commands, other tools and a call without a host are allowed', () => {
  const dir = project();
  for (const host of HAND_OVER) {
    assert.equal(evaluatePreTool(dir, SHELL[host]('git status'), host).deny, false, host);
    assert.equal(evaluatePreTool(dir, { tool_name: 'Edit', tool_input: { file_path: 'src/a.js', new_string: 'git push' } }, host).deny, false, host);
  }
  assert.equal(evaluatePreTool(dir, SHELL.cursor('git push')).deny, false);
  rmSync(dir, { recursive: true, force: true });
});

test('a Codex argv of sh -c is read as its script', () => {
  const dir = project();
  const call = (command) => ({ tool_name: 'shell', tool_input: { command } });
  assert.equal(evaluatePreTool(dir, call(['bash', '-lc', 'cd x && git push']), 'codex').deny, true);
  assert.equal(evaluatePreTool(dir, call(['git', 'status']), 'codex').deny, false);
  rmSync(dir, { recursive: true, force: true });
});

test('classes and extra patterns of the entry apply', () => {
  const dir = project('builtin:gate-command classes=irreversible extra="make deploy,/kubectl .*prod/"');
  assert.equal(evaluatePreTool(dir, SHELL.codex('git push'), 'codex').deny, false);
  assert.equal(evaluatePreTool(dir, SHELL.codex('git reset --hard'), 'codex').deny, true);
  assert.equal(evaluatePreTool(dir, SHELL.codex('make deploy prod'), 'codex').deny, true);
  assert.equal(evaluatePreTool(dir, SHELL.codex('kubectl apply -f x --context prod'), 'codex').deny, true);
  rmSync(dir, { recursive: true, force: true });
});

test('without a gate-command guardrail nothing is gated', () => {
  const dir = project(null);
  assert.equal(evaluatePreTool(dir, SHELL.cursor('git push --force'), 'cursor').deny, false);
  rmSync(dir, { recursive: true, force: true });
});

test('a denied path is still denied next to the gate', () => {
  const dir = project();
  const cat = SHELL.cursor('cat secrets/prod/key.json');
  assert.match(evaluatePreTool(dir, cat, 'cursor').reason, /blocked by guardrail no-secrets-dir/);
  assert.equal(evaluatePreTool(dir, { tool_name: 'Read', tool_input: { file_path: 'secrets/a.txt' } }, 'cursor').deny, true);
  rmSync(dir, { recursive: true, force: true });
});

test('through the CLI the hook denies on a hand-over host and allows on a native one', () => {
  const dir = project();
  const run = (host) => spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', host, '--project', dir], { input: JSON.stringify(SHELL[host]('git push')), encoding: 'utf8' });
  const cursor = run('cursor');
  assert.equal(cursor.status, 2);
  assert.match(cursor.stderr, /needs a human/);
  assert.equal(run('claude-code').status, 0);
  rmSync(dir, { recursive: true, force: true });
});
