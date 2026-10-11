import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluatePreTool, respond } from '../src/hook.mjs';
import { addPending, takePending, storeDir, list, add, PENDING_TTL_MS } from '../src/secrets/approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'bin', 'go-getter.mjs');
const VALUE = 'sup3r-s3cret-value-1234567890';
const SECRET = 'config/dev.secrets';
const RUN = ['node', 'scripts/check.mjs'];

// A project with a restricted secret file, a script that uses it, a go-getter on PATH and a private approvals store. The
// process environment is changed for the hook under test and restored by `cleanup`.
function setup({ decision = '' } = {}) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-approval-')));
  const dir = path.join(base, 'proj');
  for (const rel of ['docs/guardrails', 'docs/decisions', 'config', 'scripts']) mkdirSync(path.join(dir, rel), { recursive: true });
  writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "restricted paths"\n      run: "builtin:deny-path paths=config/*.secrets"\n---\n\n## Guardrail\n\nDo not.\n`);
  if (decision) writeFileSync(path.join(dir, 'docs/decisions/0001-secrets.md'), `---\nid: 0001-secrets\ntitle: secrets\nstatus: active\ndate: 2026-10-11\ntags: [x]\ngo-getter:\n${decision}\n---\n\nx\n`);
  writeFileSync(path.join(dir, SECRET), `TOKEN=${VALUE}\n`);
  writeFileSync(path.join(dir, 'scripts/helper.mjs'), 'export const x = 1;\n');
  writeFileSync(path.join(dir, 'scripts/check.mjs'), "import './helper.mjs';\nconsole.log('token present:', Boolean(process.env.TOKEN), 'value:', process.env.TOKEN);\n");
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(cli, path.join(bin, 'go-getter'));
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  return {
    base,
    dir,
    bash,
    // `host` is claude-code unless given; 'none' means no known host
    ask: (command, host = 'claude-code') => evaluatePreTool(dir, bash(command), host === 'none' ? undefined : host),
    run: (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env: process.env, encoding: 'utf8' }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const RUN_CMD = `go-getter secret run --from ${SECRET} -- ${RUN.join(' ')}`;

test('first use on a host that can prompt asks once, the approval is remembered, and a change to the code asks again', () => {
  const s = setup();
  try {
    const first = s.ask(RUN_CMD);
    assert.equal(first.deny, false);
    assert.equal(first.ask, true);
    assert.match(first.reason, /would run "node scripts\/check\.mjs" with config\/dev\.secrets in its environment/);
    assert.match(first.reason, /It runs 2 files: scripts\/check\.mjs, scripts\/helper\.mjs/);
    assert.ok(!first.reason.includes(VALUE));
    const out = respond('claude-code', first);
    assert.equal(out.code, 0);
    assert.deepEqual(JSON.parse(out.stdout).hookSpecificOutput, { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: first.reason });
    assert.ok(existsSync(path.join(storeDir(), 'pending.json')), 'a pending record was left');
    // the person said yes: the call goes ahead, secret run promotes the pending record and runs the command
    const ran = s.run('secret', 'run', '--from', SECRET, '--', ...RUN);
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(ran.stdout, /token present: true value: \[redacted by go-getter\]/);
    assert.ok(!(ran.stdout + ran.stderr).includes(VALUE), 'the value never appears');
    assert.deepEqual(list(s.dir).map((e) => [e.command, e.path, e.current]), [[RUN, SECRET, true]]);
    // remembered: no prompt, and the run needs no pending record
    assert.deepEqual(s.ask(RUN_CMD), { deny: false });
    assert.equal(s.run('secret', 'run', '--from', SECRET, '--', ...RUN).status, 0);
    // the code changed: it asks again, and a run that skips the hook is refused
    writeFileSync(path.join(s.dir, 'scripts/helper.mjs'), 'export const x = 2;\n');
    assert.equal(s.ask(RUN_CMD).ask, true);
    const refused = s.run('secret', 'run', '--from', SECRET, '--', ...RUN.slice(0, 2));
    assert.equal(refused.status, 0, 'the pending record the hook left for the changed code is accepted once');
    assert.equal(list(s.dir)[0].current, true);
  } finally {
    s.cleanup();
  }
});

test('a call the hook never saw cannot approve itself: no pending record, no run', () => {
  const s = setup();
  try {
    const r = s.run('secret', 'run', '--from', SECRET, '--', ...RUN);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /"node scripts\/check\.mjs" is not approved to use "config\/dev\.secrets"/);
    assert.match(r.stderr, /go-getter approvals add config\/dev\.secrets -- node scripts\/check\.mjs/);
    assert.ok(!r.stdout.includes('token present'), 'the command did not run');
    assert.deepEqual(list(s.dir), []);
    // single use: after one promotion the record is gone
    s.ask(RUN_CMD);
    assert.equal(s.run('secret', 'run', '--from', SECRET, '--', ...RUN).status, 0);
    assert.equal(takePending(s.dir, RUN, SECRET), false);
  } finally {
    s.cleanup();
  }
});

test('a pending record expires, and is for exactly one command, one path and the code as it was', () => {
  const s = setup();
  try {
    const t0 = new Date('2026-10-11T12:00:00Z');
    addPending(s.dir, RUN, SECRET, { now: () => t0 });
    assert.equal(takePending(s.dir, RUN, SECRET, { now: () => new Date(t0.getTime() + PENDING_TTL_MS + 1) }), false, 'expired');
    addPending(s.dir, RUN, SECRET, { now: () => t0 });
    assert.equal(takePending(s.dir, [...RUN, 'extra'], SECRET, { now: () => t0 }), false, 'another command');
    assert.equal(takePending(s.dir, RUN, 'config/other.secrets', { now: () => t0 }), false, 'another path');
    writeFileSync(path.join(s.dir, 'scripts/helper.mjs'), 'export const x = 3;\n');
    assert.equal(takePending(s.dir, RUN, SECRET, { now: () => t0 }), false, 'the code changed after the prompt');
    addPending(s.dir, RUN, SECRET, { now: () => t0 });
    assert.equal(takePending(s.dir, RUN, SECRET, { now: () => t0 }), true);
    assert.equal(takePending(s.dir, RUN, SECRET, { now: () => t0 }), false, 'used once');
  } finally {
    s.cleanup();
  }
});

test('a host that cannot prompt hands over, and a person approving makes later calls silent', () => {
  const s = setup();
  try {
    for (const host of ['codex', 'cursor', 'gemini-cli', 'copilot', 'kilo', 'opencode', 'none']) {
      const d = s.ask(RUN_CMD, host);
      assert.equal(d.deny, true, String(host));
      assert.equal(d.ask, undefined);
      assert.match(d.reason, /ask the user to approve it by running: go-getter approvals add config\/dev\.secrets -- node scripts\/check\.mjs/);
    }
    assert.ok(!existsSync(path.join(storeDir(), 'pending.json')), 'no pending record where nothing was asked');
    assert.equal(s.run('approvals', 'add', SECRET, '--', ...RUN).status, 0);
    assert.deepEqual(s.ask(RUN_CMD, 'codex'), { deny: false });
    assert.equal(s.run('secret', 'run', '--from', SECRET, '--', ...RUN).status, 0);
  } finally {
    s.cleanup();
  }
});

test('the project\'s shared list approves without a prompt, for a use path only', () => {
  const s = setup({ decision: `  restricted-modes: "use:config/*.secrets"\n  use-commands: "config/*.secrets|node scripts/check.mjs"` });
  try {
    assert.deepEqual(s.ask(RUN_CMD), { deny: false });
    assert.equal(s.run('secret', 'run', '--from', SECRET, '--', ...RUN).status, 0);
    assert.equal(s.ask(`go-getter secret run --from ${SECRET} -- node scripts/helper.mjs`).ask, true, 'a command the list does not name still asks');
  } finally {
    s.cleanup();
  }
});

test('a sink path is never passed to a command, approved or not', () => {
  const s = setup({ decision: `  restricted-modes: "sink:config/*.secrets"` });
  try {
    add(s.dir, RUN, SECRET);
    const d = s.ask(RUN_CMD);
    assert.equal(d.deny, true);
    assert.equal(d.ask, undefined);
    assert.match(d.reason, /a denied path/);
  } finally {
    s.cleanup();
  }
});

test('an agent cannot forge an approval: approvals add and revoke, and the store itself, are refused', () => {
  const s = setup();
  try {
    const store = storeDir();
    const denied = (command) => s.ask(command, 'claude-code').deny;
    for (const command of [
      `go-getter approvals add ${SECRET} -- node scripts/check.mjs`, `go-getter approvals revoke --all`, `ls && go-getter approvals add ${SECRET} -- node x.js`,
      `${cli} approvals add ${SECRET} -- node x.js`, `node ${cli} approvals revoke abc`,
      `cat ${store}/approvals.json`, `echo '{}' > ${store}/approvals.json`, `cp x ${store}/pending.json`, `rm -rf ${store}`, `ls ${store}`,
      `node -e "require('fs').writeFileSync('${store}/approvals.json', '{}')"`, `sh -c 'cat ${store}/approvals.json'`,
    ]) assert.equal(denied(command), true, command);
    assert.equal(evaluatePreTool(s.dir, { tool_name: 'Write', tool_input: { file_path: `${store}/approvals.json`, content: '{}' } }, 'claude-code').deny, true);
    assert.equal(evaluatePreTool(s.dir, { tool_name: 'Read', tool_input: { file_path: `${store}/approvals.json` } }, 'claude-code').deny, true);
    for (const command of ['go-getter approvals list', 'go-getter approvals list --json', 'git commit -m "mention the approvals store"', `echo ${path.basename(store)}`, 'ls scripts']) assert.equal(denied(command), false, command);
  } finally {
    s.cleanup();
  }
});

test('a secret run naming another restricted path beside the approved one is denied, not asked', () => {
  const s = setup();
  try {
    writeFileSync(path.join(s.dir, 'config/other.secrets'), 'X=1\n');
    const d = s.ask(`go-getter secret run --from ${SECRET} -- cat config/other.secrets`);
    assert.equal(d.deny, true);
    assert.match(d.reason, /a denied path/);
    assert.equal(s.ask(`go-getter secret run --from ${SECRET} -- node scripts/check.mjs; cat ${SECRET}`).deny, true, 'not a single simple command');
  } finally {
    s.cleanup();
  }
});

test('go-getter recognises the call from the project runner and a user-level install alike', () => {
  const s = setup();
  try {
    const runner = path.join(s.dir, '.go-getter/bin');
    mkdirSync(runner, { recursive: true });
    writeFileSync(path.join(runner, 'go-getter'), '#!/bin/sh\n# Generated by go-getter apply; do not edit.\nexit 0\n', { mode: 0o755 });
    for (const command of [RUN_CMD, `.go-getter/bin/go-getter secret run --from ${SECRET} -- ${RUN.join(' ')}`, `npx -y go-getter secret run --from ${SECRET} -- ${RUN.join(' ')}`, `node ${cli} secret run --from ${SECRET} -- ${RUN.join(' ')}`]) {
      assert.equal(s.ask(command).ask, true, command);
    }
    assert.equal(readFileSync(path.join(runner, 'go-getter'), 'utf8').includes('Generated'), true);
  } finally {
    s.cleanup();
  }
});
