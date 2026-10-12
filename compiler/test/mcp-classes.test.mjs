// MCP tool classes, approve-once and run grants (decision 0138 items 2 and 5, step 3 of the MCP governance plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluatePreTool, evaluatePostTool } from '../src/hook.mjs';
import { startRun } from '../src/runs/record.mjs';
import { shapeApproved, listShapes } from '../src/secrets/approvals.mjs';
import { isApprovable } from '../src/gate.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

function setup({ servers = 'github', reads = 'github:list_issues' } = {}) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-mcpc-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), '# P\n\n**Status legend**: x\n\n### 1 Step — [ ]\nClass: implement · Needs: none · Check: `true`\nDo: x.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/mcp.md'), `---\nid: mcp\ntitle: mcp\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "mcp"\n      run: 'builtin:mcp-allow servers="${servers}" reads="${reads}"'\n---\n\n## Guardrail\n\nx\n`);
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  const call = (tool, host = 'claude-code') => evaluatePreTool(dir, { tool_name: tool, tool_input: {} }, host);
  return {
    dir, call,
    after: (tool) => evaluatePostTool(dir, { tool_name: tool, tool_input: {}, tool_response: 'ok' }),
    cli: (...args) => spawnSync('node', [cli, ...args], { cwd: dir, encoding: 'utf8', env: process.env }),
    cleanup: () => {
      saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('mcp shapes are approvable beside the command shapes, and nothing else is', () => {
  assert.ok(isApprovable('pr-merge'));
  assert.ok(isApprovable('mcp:github:create_issue'));
  assert.ok(!isApprovable('mcp:github'));
  assert.ok(!isApprovable('release-create'));
  assert.ok(!isApprovable('mcp:a b:c'));
});

test('a tool marked read is free and a write asks once, then is silent after the person said yes', () => {
  const s = setup();
  try {
    assert.deepEqual(s.call('mcp__github__list_issues'), { deny: false });
    const first = s.call('mcp__github__create_issue');
    assert.equal(first.ask, true);
    assert.match(first.reason, /mcp:github:create_issue/);
    assert.equal(shapeApproved(s.dir, 'mcp:github:create_issue'), false, 'not remembered until the call ran');
    s.after('mcp__github__create_issue');
    assert.equal(shapeApproved(s.dir, 'mcp:github:create_issue'), true);
    assert.deepEqual(s.call('mcp__github__create_issue'), { deny: false });
    assert.equal(s.call('mcp__github__delete_repo').ask, true, 'another write tool asks on its own');
  } finally { s.cleanup(); }
});

test('on a host that cannot ask, a write is denied naming approvals allow, and approvals allow records it', () => {
  const s = setup();
  try {
    const d = s.call('mcp__github__create_issue', 'codex');
    assert.equal(d.deny, true);
    assert.match(d.reason, /go-getter approvals allow mcp:github:create_issue/);
    const r = s.cli('approvals', 'allow', 'mcp:github:create_issue');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(s.call('mcp__github__create_issue', 'codex'), { deny: false });
    assert.match(s.cli('approvals', 'list').stdout, /mcp:github:create_issue.*MCP write tool/);
    assert.notEqual(s.cli('approvals', 'allow', 'mcp:bad id:x').status, 0);
    assert.equal(s.cli('approvals', 'revoke', 'mcp:github:create_issue').status, 0);
    assert.equal(s.call('mcp__github__create_issue', 'codex').deny, true, 'a revoked approval asks again');
  } finally { s.cleanup(); }
});

test('a run grants a listed write tool and nothing else', () => {
  const s = setup();
  try {
    startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['1'], grants: ['mcp:github:create_issue'] });
    assert.deepEqual(s.call('mcp__github__create_issue', 'codex'), { deny: false });
    assert.equal(s.call('mcp__github__merge_pull_request', 'codex').deny, true, 'an ungranted write is still denied');
  } finally { s.cleanup(); }
});

test('an approval or a grant does not outlive the server leaving the allowlist', () => {
  const s = setup({ servers: 'github' });
  try {
    s.cli('approvals', 'allow', 'mcp:slack:post_message');
    startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['1'], grants: ['mcp:slack:post_message'] });
    const d = s.call('mcp__slack__post_message');
    assert.equal(d.deny, true);
    assert.match(d.reason, /allowlist/);
  } finally { s.cleanup(); }
});

test('run start --grant accepts an mcp shape and refuses a malformed one', () => {
  const s = setup();
  try {
    assert.equal(s.cli('run', 'start', 'docs/plans/p.md', '--grant', 'mcp:bad id:x').status, 1);
    const ok = s.cli('run', 'start', 'docs/plans/p.md', '--grant', 'mcp:github:create_issue');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /grants: mcp:github:create_issue/);
  } finally { s.cleanup(); }
});

test('a host that shows no server, and an entry without a reads argument, keep the allowlist behaviour only', () => {
  const s = setup();
  try {
    assert.equal(s.call('MCP:create_issue', 'cursor').deny, false);
    assert.equal(listShapes(s.dir).length, 0);
  } finally { s.cleanup(); }
  const old = setup();
  try {
    writeFileSync(path.join(old.dir, 'docs/guardrails/mcp.md'), `---\nid: mcp\ntitle: mcp\nstatus: active\ndate: 2026-10-12\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "mcp"\n      run: 'builtin:mcp-allow servers="github"'\n---\n\n## Guardrail\n\nx\n`);
    assert.deepEqual(old.call('mcp__github__create_issue'), { deny: false });
  } finally { old.cleanup(); }
});
