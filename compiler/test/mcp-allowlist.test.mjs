// The MCP server allowlist (decision 0138 item 1, step 2 of the MCP governance plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluatePreTool } from '../src/hook.mjs';
import { mcpCall, normaliseServer, allowedServers } from '../src/mcp.mjs';

function project(servers) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-mcp-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  if (servers !== undefined) {
    writeFileSync(path.join(dir, 'docs/guardrails/mcp-servers-are-allowlisted.md'), `---\nid: mcp-servers-are-allowlisted\ntitle: allowlist\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "allowlist"\n      run: 'builtin:mcp-allow servers="${servers}"'\n---\n\n## Guardrail\n\nx\n`);
  }
  return dir;
}
const call = (dir, tool, host = 'claude-code') => evaluatePreTool(dir, { tool_name: tool, tool_input: {} }, host);

test('mcpCall reads the server and tool where the host shows them', () => {
  assert.deepEqual(mcpCall('mcp__github__create_issue'), { server: 'github', tool: 'create_issue' });
  assert.deepEqual(mcpCall('mcp__claude_ai_Claude_Docs__create'), { server: 'claude_ai_Claude_Docs', tool: 'create' });
  assert.deepEqual(mcpCall('MCP:create_issue'), { server: null, tool: 'create_issue' });
  assert.equal(mcpCall('Bash'), null);
  assert.equal(mcpCall(undefined), null);
});

test('server names are compared after the host renaming and without case', () => {
  assert.equal(normaliseServer('my server.v2'), 'my_server_v2');
  assert.deepEqual(allowedServers({ servers: 'GitHub, my.server' }), ['github', 'my_server']);
});

test('a listed server passes and an unlisted one is denied, by name, on hosts that show the server', () => {
  const dir = project('github, my.server');
  try {
    for (const host of ['claude-code', 'codex']) {
      assert.equal(call(dir, 'mcp__github__create_issue', host).deny, false, `${host} listed`);
      assert.equal(call(dir, 'mcp__my_server__ping', host).deny, false, `${host} renamed`);
      const d = call(dir, 'mcp__evil__exfiltrate', host);
      assert.equal(d.deny, true, `${host} unlisted`);
      assert.match(d.reason, /mcp-servers-are-allowlisted.*"evil".*allowlist/);
    }
    assert.equal(call(dir, 'Bash').deny, false, 'other tools are not governed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an empty list allows no MCP at all', () => {
  const dir = project('');
  try {
    assert.equal(call(dir, 'mcp__github__create_issue').deny, true);
    assert.equal(call(dir, 'Read').deny, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a host whose hook shows no server is not denied by the allowlist (advisory, fact 0036)', () => {
  const dir = project('github');
  try {
    assert.equal(call(dir, 'MCP:create_issue', 'cursor').deny, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a project without the guardrail is unchanged', () => {
  const dir = project(undefined);
  try {
    assert.equal(call(dir, 'mcp__anything__tool').deny, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
