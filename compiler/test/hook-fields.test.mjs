import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin/go-getter.mjs');
// Built at runtime: the restricted names must not appear literally in this file (the hook under test would deny edits to it).
const ENV = '.' + 'env';
const PEM = 'server.' + 'pem';

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-hook-fields-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  const run = `builtin:deny-path paths=${ENV},*.${PEM.split('.')[1]},secrets/**`;
  writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "restricted paths"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo not.\n`);
  return dir;
}

const call = (tool_name, tool_input) => ({ tool_name, tool_input });

test('prose fields of known tools are not scanned for restricted names', () => {
  const dir = project();
  const prose = `summarise how a ${ENV} file and ${PEM} are loaded`;
  for (const payload of [
    call('WebFetch', { url: 'https://example.com/docs', prompt: prose }),
    call('WebSearch', { query: prose }),
    call('Agent', { description: 'brief', prompt: prose, subagent_type: 'implementer' }),
    call('Task', { prompt: prose }),
    call('web_fetch', { prompt: prose }),
    call('google_web_search', { query: prose }),
    call('webfetch', { url: 'https://example.com', format: 'text', prompt: prose }),
    call('spawn_agent', { message: prose }),
    call('Write', { file_path: path.join(dir, 'README.md'), content: prose }),
    call('Edit', { file_path: 'README.md', old_string: 'x', new_string: prose }),
    call('edit', { filePath: 'README.md', oldString: 'x', newString: prose }),
    call('Grep', { pattern: ENV, path: 'src' }),
    call('Bash', { command: 'ls src', description: prose }),
    call('TodoWrite', { todos: [{ content: prose }] }),
    { toolName: 'web_fetch', toolArgs: JSON.stringify({ url: 'https://example.com', prompt: prose }) },
  ]) {
    assert.equal(evaluatePreTool(dir, payload).deny, false, JSON.stringify(payload));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('reads, writes and shell commands naming a restricted path stay denied on every host', () => {
  const dir = project();
  const abs = path.join(dir, ENV);
  for (const payload of [
    call('Read', { file_path: abs }),
    call('Write', { file_path: `deploy/${ENV}`, content: 'X=1' }),
    call('Edit', { file_path: `certs/${PEM}`, old_string: 'a', new_string: 'b' }),
    call('Bash', { command: `cat ${ENV} | head`, description: 'show config' }),
    call('Bash', { command: `git commit -m "drop ${ENV}"` }),
    call('Grep', { pattern: 'KEY', path: ENV }),
    call('Grep', { pattern: 'KEY', glob: `**/${ENV}` }),
    call('Glob', { pattern: `**/${PEM}` }),
    call('read_file', { file_path: abs }),
    call('run_shell_command', { command: `cat ${ENV}`, description: 'x' }),
    call('read', { filePath: abs }),
    call('bash', { command: `cat ${ENV}`, description: 'x' }),
    call('Shell', { command: `cat ${ENV}` }),
    call('WebFetch', { url: `file://${abs}`, prompt: 'read it' }),
    call('Agent', { prompt: 'x', cwd_override: `secrets/prod` }),
    { toolName: 'bash', toolArgs: JSON.stringify({ command: `cat ${ENV}` }) },
    { toolName: 'view', toolArgs: `{"path": "${ENV}"` },
    // names confirmed in fact 0031: Codex and Copilot patches, Copilot PowerShell and rg
    call('apply_patch', { command: `*** Begin Patch\n*** Update File: ${ENV}\n+X=1\n*** End Patch` }),
    { toolName: 'powershell', toolArgs: { command: `Get-Content ${ENV}` } },
    { toolName: 'rg', toolArgs: { pattern: 'KEY', path: ENV } },
  ]) {
    assert.equal(evaluatePreTool(dir, payload).deny, true, JSON.stringify(payload));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('an unknown tool is scanned in every field and the denial names the tool', () => {
  const dir = project();
  for (const field of ['prompt', 'query', 'content', 'message', 'anything']) {
    const d = evaluatePreTool(dir, call('mcp__vault__fetch', { [field]: `open ${ENV} now` }));
    assert.equal(d.deny, true, field);
    assert.match(d.reason, /mcp__vault__fetch/);
  }
  assert.equal(evaluatePreTool(dir, { tool_name: 'mystery', tool_input: { nested: { list: [`a/${PEM}`] } } }).deny, true);
  assert.equal(evaluatePreTool(dir, { something: `cat ${ENV}` }).deny, true, 'no tool name: whole payload scanned');
  assert.equal(evaluatePreTool(dir, call('mcp__vault__fetch', { prompt: 'nothing restricted' })).deny, false);
  // Through the CLI, as a host calls it.
  const res = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(call('Read', { file_path: ENV })), encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /blocked by guardrail restricted: Read names/);
  const ok = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(call('WebFetch', { url: 'https://example.com', prompt: `explain ${ENV}` })), encoding: 'utf8' });
  assert.equal(ok.status, 0);
  rmSync(dir, { recursive: true, force: true });
});
