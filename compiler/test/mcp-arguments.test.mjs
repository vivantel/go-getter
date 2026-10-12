// The MCP argument scan (decision 0138 item 3, step 4 of the MCP governance plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluatePreTool } from '../src/hook.mjs';
import { secretKinds } from '../src/mcp.mjs';

const TOKEN = `ghp_${'a1B2c3D4e5'.repeat(4)}`;

function project(withGuardrail = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-mcpa-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  if (withGuardrail) writeFileSync(path.join(dir, 'docs/guardrails/mcp-scan.md'), '---\nid: mcp-scan\ntitle: scan\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "scan"\n      run: "builtin:mcp-scan"\n---\n\n## Guardrail\n\nx\n');
  return dir;
}
const call = (dir, tool, input, host = 'claude-code') => evaluatePreTool(dir, { tool_name: tool, tool_input: input }, host);

test('secretKinds names kinds and never the text', () => {
  assert.deepEqual(secretKinds({ body: `use ${TOKEN}` }), ['github']);
  assert.deepEqual(secretKinds({ body: 'hello' }), []);
  assert.deepEqual(secretKinds(undefined), []);
});

test('a call with a token is denied by kind on every host shape; the denial holds no secret', () => {
  const dir = project();
  try {
    for (const [tool, host] of [['mcp__srv__post', 'claude-code'], ['mcp__srv__post', 'codex'], ['MCP:post', 'cursor']]) {
      const d = call(dir, tool, { text: `token ${TOKEN}` }, host);
      assert.equal(d.deny, true, `${host}`);
      assert.match(d.reason, /mcp-scan.*secret \(github\)/);
      assert.equal(d.reason.includes(TOKEN), false);
      assert.equal(d.reason.includes('a1B2c3D4e5'), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a clean call passes, a non-MCP tool is not governed, and a project without the guardrail is unchanged', () => {
  const dir = project();
  try {
    assert.equal(call(dir, 'mcp__srv__post', { text: 'hello' }).deny, false);
    assert.equal(call(dir, 'Bash', { command: `echo ${TOKEN}` }).deny, false, 'shell commands are other guardrails\' business');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const bare = project(false);
  try {
    assert.equal(call(bare, 'mcp__srv__post', { text: TOKEN }).deny, false);
  } finally { rmSync(bare, { recursive: true, force: true }); }
});

test('the sanitization pack asks mcp-argument-scan: on renders the hook-enforced guardrail, off renders only a decision', async () => {
  const { loadPack } = await import('../src/packs.mjs');
  const { planRender } = await import('../src/render.mjs');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const pack = loadPack(path.join(root, 'src/packs/sanitization/pack.json'));
  const base = { 'secret-scan': pack.questions.find((q) => q.id === 'secret-scan').options.find((o) => o.recommended).id, 'scan-allow-paths': [], 'pii-masking': pack.questions.find((q) => q.id === 'pii-masking').options.find((o) => o.recommended).id, 'pii-extra': [] };
  const render = (answer) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gg-mcpa-'));
    mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nhooks — x\nguardrail — x\nsecurity — x\n');
    try {
      return planRender({ root: dir, pack, answers: { ...base, 'mcp-argument-scan': answer }, acceptedBy: 't', date: '2026-10-12' }).artifacts;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const on = render('on');
  assert.ok(on.some((a) => /mcp-arguments-hold-no-secret/.test(a.path)), 'on renders the guardrail');
  assert.ok(on.some((a) => /builtin:mcp-scan/.test(a.content ?? JSON.stringify(a))), 'with the hook-enforced entry');
  const off = render('off');
  assert.ok(!off.some((a) => /mcp-arguments-hold-no-secret/.test(a.path)), 'off renders no guardrail');
  assert.ok(off.some((a) => /mcp-arguments-not-scanned/.test(a.path)), 'but records the choice');
});
