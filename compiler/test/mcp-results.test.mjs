// MCP result masking (decision 0138 item 4, step 5 of the MCP governance plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePostTool, respondPostTool, REDACTED } from '../src/hook.mjs';
import { hostHookOutputs } from '../src/apply.mjs';
import { coverage, formatCoverage } from '../src/coverage.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { loadPack } from '../src/packs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = `ghp_${'a1B2c3D4e5'.repeat(4)}`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-mcpr-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  const rule = (id, run) => writeFileSync(path.join(dir, `docs/guardrails/${id}.md`), `---\nid: ${id}\ntitle: ${id}\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nx\n`);
  rule('restricted', 'builtin:deny-path paths=".env"');
  rule('pii', 'builtin:redact-pii classes="email"');
  return dir;
}
const post = (dir, tool, response) => evaluatePostTool(dir, { tool_name: tool, tool_input: {}, tool_response: response, session_id: 's1' });

test('a secret and an email in an MCP result are masked and the clean result is left alone', () => {
  const dir = project();
  try {
    const dirty = post(dir, 'mcp__srv__get', `key ${TOKEN} mail jo@example.com`);
    assert.equal(dirty.mcp, true);
    assert.ok(dirty.redactions >= 1);
    assert.equal(JSON.stringify(dirty.output).includes(TOKEN), false);
    assert.equal(JSON.stringify(dirty.output).includes('jo@example.com'), false);
    const clean = post(dir, 'mcp__srv__get', 'hello');
    assert.equal(clean.redactions, 0);
    assert.deepEqual(respondPostTool('claude-code', clean), { code: 0, stdout: '', stderr: '' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('each host that can replace an MCP result answers with its own shape; Cursor replaces MCP results only; OpenCode cannot', () => {
  const dir = project();
  try {
    const r = post(dir, 'mcp__srv__get', `x ${TOKEN}`);
    const answer = (host, res = r) => respondPostTool(host, res);
    assert.match(answer('claude-code').stdout, /updatedMCPToolOutput/);
    for (const host of ['codex', 'gemini-cli', 'copilot', 'kilo']) {
      const a = answer(host);
      assert.ok(a.stdout, `${host} replaces`);
      assert.equal(a.stdout.includes(TOKEN), false, host);
    }
    const cursorMcp = post(dir, 'MCP:get', `x ${TOKEN}`);
    assert.equal(cursorMcp.mcp, true);
    assert.match(answer('cursor', cursorMcp).stdout, /updated_mcp_tool_output/);
    const cursorOther = post(dir, 'Shell', { stdout: `x ${TOKEN}` });
    assert.equal(answer('cursor', cursorOther).stdout, '', 'Cursor cannot replace other tools');
    assert.equal(answer('opencode').stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a project that adopted MCP governance gets the post-tool hook on Cursor too, and others do not', () => {
  const dir = project();
  try {
    const hooks = (mcp, hosts = ['claude-code', 'cursor']) => hostHookOutputs(dir, hosts, true, false, false, false, mcp);
    const withMcp = hooks(true);
    assert.match(JSON.parse(withMcp['.cursor/hooks.json'].content).hooks.postToolUse[0].command, /hook post-tool --host cursor/);
    assert.match(JSON.parse(withMcp['.claude/settings.json'].content).hooks.PostToolUse[0].hooks[0].command, /post-tool --host claude-code/);
    assert.equal(JSON.parse(hooks(false)['.cursor/hooks.json'].content).hooks.postToolUse, undefined, 'no MCP governance, no Cursor post-tool hook');
    // only MCP governance adopted (no restricted path, no PII answer): the hook is still written
    const only = hostHookOutputs(dir, ['cursor'], false, false, false, false, true);
    assert.ok(only['.cursor/hooks.json'], 'a Cursor hook file is written for MCP governance alone');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('coverage names the hosts that replace MCP results alone and the ones that cannot replace', () => {
  const dir = project();
  try {
    writeFileSync(path.join(dir, 'docs/guardrails/mcp.md'), '---\nid: mcp\ntitle: mcp\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  generated-by: sanitization@0.7.0\n  enforcement:\n    - tier: 2\n      check: "mcp"\n      run: \'builtin:mcp-allow servers="a" reads=""\'\n---\n\n## Guardrail\n\nx\n');
    mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/decisions/0001-s.md'), '---\nid: 0001-s\ntitle: s\nstatus: active\ndate: 2026-10-12\ntags: [x]\ngo-getter:\n  generated-by: sanitization@0.7.0\n---\n\nx\n');
    const caps = loadCapabilities(root);
    const packs = { sanitization: loadPack(path.join(root, 'src/packs/sanitization/pack.json')) };
    const row = coverage(dir, packs, caps).find((r) => r.component === 7);
    assert.deepEqual(row.outputMasking.mcpOnly, ['cursor']);
    assert.ok(row.outputMasking.none.includes('opencode'));
    assert.match(formatCoverage(coverage(dir, packs, caps)), /MCP results alone on cursor/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
