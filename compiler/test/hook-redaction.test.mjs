import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluatePostTool, respondPostTool, redactText, restrictedValues, REDACTED } from '../src/hook.mjs';
import { hostHookOutputs } from '../src/apply.mjs';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin/go-getter.mjs');
// Built at runtime: no restricted name, token or key block appears literally in this file.
const ENV = '.' + 'env';
const TOKEN = ['gh', 'p_'].join('') + 'Ab12'.repeat(9);
const DASH = '-'.repeat(5);
const KEY = [`${DASH}BEGIN OPENSSH PRIVATE KEY${DASH}`, 'b3BlbnNzaC1rZXktdjEAAAAA', 'QUJDREVGR0hJSktMTU5PUA==', `${DASH}END OPENSSH PRIVATE KEY${DASH}`].join('\n');
const DB_VALUE = 'pw-' + 'q7Zr'.repeat(4);

function project({ guardrail = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-hook-redact-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'config'), { recursive: true });
  if (guardrail) {
    writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "restricted paths"\n      run: "builtin:deny-path paths=${ENV},secrets/**"\n---\n\n## Guardrail\n\nDo not.\n`);
  }
  writeFileSync(path.join(dir, 'config', ENV), `# local\nDB_PASSWORD="${DB_VALUE}"\nexport PORT=3000\nDEBUG=true\n`);
  writeFileSync(path.join(dir, 'config/app.conf'), `NAME=${'ordinary'.repeat(2)}\n`);
  return dir;
}

const shell = (stdout, stderr = '') => ({ tool_name: 'Bash', tool_input: { command: 'some command' }, tool_response: { stdout, stderr, interrupted: false } });

test('a shell result loses a planted token and a private-key block, and other text is unchanged', () => {
  const dir = project();
  const stdout = `build ok\ntoken: ${TOKEN}\n${KEY}\ndone in 3s\n`;
  const r = evaluatePostTool(dir, shell(stdout, 'warn: none'));
  assert.equal(r.redactions, 2);
  assert.equal(r.output.stdout, `build ok\ntoken: ${REDACTED}\n${REDACTED}\ndone in 3s\n`);
  assert.equal(r.output.stderr, 'warn: none');
  assert.equal(r.output.interrupted, false);
  assert.ok(!JSON.stringify(r.output).includes(TOKEN));
  rmSync(dir, { recursive: true, force: true });
});

test('values of KEY=value lines of restricted files are redacted; short values and other files are not', () => {
  const dir = project();
  assert.deepEqual([...restrictedValues(dir)], [DB_VALUE]);
  const r = evaluatePostTool(dir, shell(`connecting with ${DB_VALUE} on 3000 debug=true ${'ordinary'.repeat(2)}`));
  assert.equal(r.redactions, 1);
  assert.equal(r.output.stdout, `connecting with ${REDACTED} on 3000 debug=true ${'ordinary'.repeat(2)}`);
  rmSync(dir, { recursive: true, force: true });
});

test('a truncated key block is redacted to the end of the output', () => {
  const head = KEY.split('\n').slice(0, 2).join('\n');
  assert.deepEqual(redactText(`a\n${head}`, new Set()), { text: `a\n${REDACTED}`, count: 1 });
});

test('clean output is left alone and the host gets no replacement', () => {
  const dir = project({ guardrail: false });
  const r = evaluatePostTool(dir, shell('all tests passed'));
  assert.equal(r.redactions, 0);
  assert.deepEqual(respondPostTool('claude-code', r), { code: 0, stdout: '', stderr: '' });
  rmSync(dir, { recursive: true, force: true });
});

test('the replacement keeps the result shape, and MCP results use the MCP field', () => {
  const r = { output: { stdout: REDACTED }, redactions: 1, mcp: false };
  assert.deepEqual(JSON.parse(respondPostTool('claude-code', r).stdout), { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: { stdout: REDACTED } } });
  assert.ok(JSON.parse(respondPostTool('claude-code', { ...r, mcp: true }).stdout).hookSpecificOutput.updatedMCPToolOutput);
  assert.equal(respondPostTool('cursor', r).stdout, '');
});

test('go-getter hook post-tool answers with the redacted result', () => {
  const dir = project();
  const run = spawnSync('node', [cli, 'hook', 'post-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(shell(`x ${TOKEN} y`)), encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.updatedToolOutput.stdout, `x ${REDACTED} y`);
  assert.ok(!run.stdout.includes(TOKEN));
  rmSync(dir, { recursive: true, force: true });
});

test('apply installs the post-tool hook only where the host can rewrite output', () => {
  const dir = project();
  const out = hostHookOutputs(dir, ['claude-code', 'codex', 'gemini-cli', 'copilot', 'cursor', 'kilo', 'opencode'], true);
  const hooks = (rel) => JSON.parse(out[rel].content).hooks;
  assert.match(hooks('.claude/settings.json').PostToolUse[0].hooks[0].command, /hook post-tool --host claude-code/);
  assert.match(hooks('.codex/hooks.json').PostToolUse[0].hooks[0].command, /hook post-tool --host codex/);
  assert.match(hooks('.gemini/settings.json').AfterTool[0].hooks[0].command, /hook post-tool --host gemini-cli/);
  assert.match(hooks('.github/hooks/go-getter.json').postToolUse[0].bash, /hook post-tool --host copilot/);
  assert.ok(!JSON.stringify(hooks('.cursor/hooks.json')).includes('post-tool'), 'Cursor replaces MCP results only');
  assert.match(out['.kilo/plugin/go-getter.js'].content, /'tool\.execute\.after'[\s\S]*'post-tool', '--host', 'kilo'/);
  assert.ok(!out['.opencode/plugins/go-getter.js'].content.includes('post-tool'), 'OpenCode output rewriting is unconfirmed');
  assert.equal(JSON.parse(hostHookOutputs(dir, ['claude-code'], false, true)['.claude/settings.json'].content).hooks.PostToolUse, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('each host gets the redacted result in the shape its post-tool hook reads (fact 0031)', () => {
  const dir = project();
  const answer = (host, payload) => {
    const r = evaluatePostTool(dir, payload);
    assert.ok(r.redactions >= 1, host);
    const out = respondPostTool(host, r);
    assert.ok(!out.stdout.includes(TOKEN), host);
    return JSON.parse(out.stdout);
  };
  const line = `x ${TOKEN} y`;
  assert.deepEqual(answer('copilot', { toolName: 'bash', toolArgs: { command: 'c' }, toolResult: { resultType: 'success', textResultForLlm: line } }), { modifiedResult: { resultType: 'success', textResultForLlm: `x ${REDACTED} y` } });
  const codex = answer('codex', shell(line));
  assert.equal(codex.decision, 'block');
  assert.equal(JSON.parse(codex.reason).stdout, `x ${REDACTED} y`);
  assert.deepEqual(answer('gemini-cli', { tool_name: 'run_shell_command', tool_response: { llmContent: line, returnDisplay: line } }), { decision: 'deny', reason: `x ${REDACTED} y` });
  assert.deepEqual(answer('kilo', { tool_name: 'bash', tool_response: line }), { output: `x ${REDACTED} y` });
  for (const host of ['cursor', 'opencode']) assert.equal(respondPostTool(host, evaluatePostTool(dir, shell(line))).stdout, '', host);
  rmSync(dir, { recursive: true, force: true });
});
