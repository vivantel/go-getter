// WP8: the isolation gate, the session hooks, the release after a merge and the hook install. Every case runs in a throwaway repository.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { poolFixture } from './helpers/pool-fixture.mjs';
import { hostHookOutputs } from '../src/apply.mjs';
import { releaseWorktree } from '../src/worktree.mjs';

let fx;
afterEach(() => fx?.cleanup());

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-11-01\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: c\n      run: ${run}\n---\n\n## Guardrail\n\nx\n`;

function setup(config) {
  fx = poolFixture({ config: { size: 3, warm: 0, ...config } });
  mkdirSync(path.join(fx.main, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(fx.main, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(fx.main, 'docs/guardrails/work-happens-in-pool-worktrees.md'), guardrail('work-happens-in-pool-worktrees', 'builtin:pool-isolation'));
  return fx;
}
const NO_BG = { GO_GETTER_POOL_NO_BG: '1' };
const call = (tool_name, tool_input, cwd = fx.main) => {
  const r = fx.run(['hook', 'pre-tool', '--host', 'claude-code', '--project', fx.main], { cwd, env: NO_BG, input: JSON.stringify({ tool_name, tool_input, cwd }) });
  return { denied: r.code === 2, reason: r.err };
};
const bash = (command, cwd) => call('Bash', { command }, cwd);

test('with pool-only, an edit and a changing command in the main checkout are denied, naming the verb', () => {
  setup({ only: true });
  for (const d of [call('Edit', { file_path: path.join(fx.main, 'README.md'), old_string: 'a', new_string: 'b' }), call('Write', { file_path: 'x.txt', content: 'x' }), bash('npm test'), bash('echo hi > out.txt'), bash('git commit -am x')]) {
    assert.equal(d.denied, true, d.reason);
    assert.match(d.reason, /pool acquire/);
    assert.match(d.reason, /work-happens-in-pool-worktrees/);
  }
});

test('reads, go-getter verbs, a slot and places outside the repository stay allowed', () => {
  setup({ only: true });
  const slot = fx.freeSlot(1);
  for (const d of [
    call('Read', { file_path: path.join(fx.main, 'README.md') }),
    bash('git status && git log --oneline | head -3'), bash('ls docs | grep guardrails'), bash('gh pr view 5'),
    bash('npx go-getter pool acquire --session s1'), bash('git branch --show-current'),
    call('Edit', { file_path: path.join(slot, 'README.md'), old_string: 'a', new_string: 'b' }),
    call('Write', { file_path: path.join(fx.parent, 'scratch.txt'), content: 'x' }),
    bash(`cd ${slot} && npm test`), bash(`git -C ${slot} commit -am x`), bash('npm test', slot),
  ]) assert.equal(d.denied, false, d.reason);
});

test('a bare go-getter verb is allowed in the main checkout even when the hook PATH cannot find the program', () => {
  setup({ only: true });
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: fx.main, tool_input: { command: 'go-getter pool acquire --branch x 2>&1 | tail -5; go-getter plan status p.md' } });
  const r = fx.run(['hook', 'pre-tool', '--host', 'claude-code', '--project', fx.main], { input, env: { PATH: '/usr/bin:/bin' } });
  assert.equal(r.code, 0, r.err);
});

test('without pool-only an edit in the main checkout is allowed, and raw worktree add, remove and prune are denied in pool mode', () => {
  setup({});
  assert.equal(call('Edit', { file_path: path.join(fx.main, 'README.md'), old_string: 'a', new_string: 'b' }).denied, false);
  for (const [cmd, verb] of [['git worktree remove ../x', /pool remove/], ['git worktree add ../y -b feat/y', /pool acquire/], ['git worktree prune', /pool doctor/]]) {
    const d = bash(cmd);
    assert.equal(d.denied, true, cmd);
    assert.match(d.reason, verb);
  }
  assert.equal(bash('git worktree list').denied, false);
});

test('a project without the pool answers is untouched', () => {
  setup({});
  fx.run(['pool', 'status']); // sanity: pool commands run
  const off = poolFixture({ config: {} });
  try {
    mkdirSync(path.join(off.main, 'docs/guardrails'), { recursive: true });
    writeFileSync(path.join(off.main, 'docs/guardrails/g.md'), guardrail('g', 'builtin:pool-isolation'));
    const r = off.run(['hook', 'pre-tool', '--host', 'claude-code', '--project', off.main], { env: { GO_GETTER_POOL_CONFIG: '{}', ...NO_BG }, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree remove x' }, cwd: off.main }) });
    assert.equal(r.code, 0, r.err);
  } finally { off.cleanup(); }
});

test('the session hook acquires one unnamed slot per session, and the end hook frees it or says why it kept it', () => {
  setup({ only: true });
  const start = (session) => fx.run(['hook', 'session-start', '--host', 'claude-code', '--project', fx.main], { env: NO_BG, input: JSON.stringify({ session_id: session, cwd: fx.main }) });
  const end = (session) => fx.run(['hook', 'session-end', '--host', 'claude-code', '--project', fx.main], { env: NO_BG, input: JSON.stringify({ session_id: session, cwd: fx.main }) });
  const first = start('s1');
  assert.match(first.out, /your slot is .*pool-01/);
  assert.match(start('s1').out, /pool-01/);
  assert.equal(fx.readLease(2), null, 'the same session does not take a second slot');
  assert.match(start('s2').out, /pool-02/);
  assert.match(end('s1').err, /pool-01 was finished and is released/);
  assert.equal(fx.readLease(1), null);
  fx.write(fx.slot(2), 'notes.txt');
  assert.match(end('s2').err, /pool-02 kept/);
  assert.ok(fx.readLease(2).ended);
});

test('the session hook never blocks when the pool is off', () => {
  setup({});
  const r = fx.run(['hook', 'session-start', '--host', 'claude-code', '--project', fx.main], { env: { GO_GETTER_POOL_CONFIG: '{}', ...NO_BG }, input: JSON.stringify({ session_id: 's', cwd: fx.main }) });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /your slot/);
});

test('a slot is released after a confirmed merge, unless uncommitted files would be lost', () => {
  setup({});
  const env = { GO_GETTER_TEST_MODE: '1', GO_GETTER_POOL_CONFIG: JSON.stringify({ size: 3, base: fx.base, warm: 0 }) };
  Object.assign(process.env, env);
  try {
    const a = fx.pool('acquire', '--branch', 'feat/a').out.split(' ')[0];
    fx.commit(a, 'a.txt', 'a');
    fx.git(a, 'push', '-q', '-u', 'origin', 'feat/a');
    fx.squashOntoBase('feat/a');
    fx.write(a, 'dirty.txt');
    const kept = releaseWorktree(a);
    assert.equal(kept.released, false);
    assert.match(kept.reason, /1 uncommitted/);
    fx.git(a, 'clean', '-fdq');
    const done = releaseWorktree(a);
    assert.equal(done.released, true, JSON.stringify(done));
    assert.equal(fx.readLease(1), null);
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
});

test('apply installs the session hooks where the host has them when the pool guardrail exists', () => {
  setup({ only: true });
  const files = hostHookOutputs(fx.main, ['claude-code'], true, false, false, false, false, () => ({}), null, true);
  const text = files['.claude/settings.json'].content;
  assert.match(text, /hook session-start/);
  assert.match(text, /hook session-end/);
  const without = hostHookOutputs(fx.main, ['claude-code'], true, false, false, false, false, () => ({}), null, false)['.claude/settings.json'].content;
  assert.doesNotMatch(without, /session-end/);
});

test('every host with a blocking pre-tool hook gets the same denial', async () => {
  setup({ only: true });
  const { evaluatePreTool, respond } = await import('../src/hook.mjs');
  const env = { GO_GETTER_TEST_MODE: '1', GO_GETTER_POOL_CONFIG: JSON.stringify({ size: 3, base: fx.base, only: true }) };
  Object.assign(process.env, env);
  try {
    for (const host of ['claude-code', 'codex', 'gemini-cli', 'cursor', 'copilot']) {
      const d = evaluatePreTool(fx.main, { tool_name: host === 'copilot' ? 'bash' : 'Bash', tool_input: { command: 'npm test' }, cwd: fx.main }, host);
      assert.equal(d.deny, true, host);
      const out = respond(host, d);
      assert.match(out.stderr + out.stdout, /pool acquire/, host);
    }
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
});

// A3: a refusal names only a command the build that printed it can run.
import { mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

function fakeBin(script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-stale-'));
  writeFileSync(path.join(dir, 'go-getter'), `#!/bin/sh\n${script}\n`);
  chmodSync(path.join(dir, 'go-getter'), 0o755);
  return dir;
}
const refuseWith = (envPath) => {
  setup({ only: true });
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: fx.main, tool_input: { command: 'npm test' } });
  return fx.run(['hook', 'pre-tool', '--host', 'claude-code', '--project', fx.main], { input, env: { PATH: envPath } });
};

test('a refusal does not name a bare go-getter when the one on PATH is old and has no pool', () => {
  const old = fakeBin('echo \'go-getter: unknown command "pool"\'; echo "usage: go-getter <build|check|detect>"; exit 2');
  try {
    const r = refuseWith(`${old}:/usr/bin:/bin`);
    assert.equal(r.code, 2, r.err);
    assert.doesNotMatch(r.err, /`go-getter pool acquire`/);
    assert.match(r.err, /`node '[^']+go-getter\.mjs' pool acquire`/);
  } finally { rmSync(old, { recursive: true, force: true }); }
});

test('a refusal names the node entry script when no go-getter is on PATH', () => {
  const r = refuseWith('/usr/bin:/bin');
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /`node '[^']+go-getter\.mjs' pool acquire`/);
});

test('a refusal keeps the bare verb when the go-getter on PATH knows pool', () => {
  const ok = fakeBin('echo "usage: go-getter pool acquire ..."; exit 2');
  try {
    const r = refuseWith(`${ok}:/usr/bin:/bin`);
    assert.match(r.err, /`go-getter pool acquire`/);
  } finally { rmSync(ok, { recursive: true, force: true }); }
});

// A2: known false positives and dead ends of the isolation gate.
test('A2.1 a read-only compound command and a gh api GET are not "changes the main checkout"', () => {
  setup({ only: true });
  for (const c of ['for f in a b; do echo $f; done', 'if [ -f README.md ]; then ls; fi', 'while read l; do echo $l; done < README.md', 'gh api repos/o/r/pulls', 'gh api -X GET repos/o/r/pulls/1']) {
    const d = bash(c);
    assert.equal(d.denied, false, `${c}: ${d.reason}`);
  }
  for (const c of ['for f in a b; do rm $f; done', 'if true; then npm test; fi', 'gh api -X POST repos/o/r/issues', 'gh api repos/o/r/issues -f title=x']) {
    assert.equal(bash(c).denied, true, c);
  }
});

test('A2.2 a raw git worktree command is judged against the repository it targets', () => {
  setup({});
  const other = poolFixture({ config: {} });
  try {
    for (const c of [`git -C ${other.main} worktree add ../zz -b zz`, `cd ${other.main} && git worktree remove ../zz`]) {
      assert.equal(bash(c).denied, false, c);
    }
    assert.equal(bash(`git -C ${fx.main} worktree add ../yy -b yy`).denied, true);
    assert.equal(bash('git worktree add ../yy -b yy').denied, true);
  } finally { other.cleanup(); }
});

test('A2.3 node <checkout>/compiler/bin/go-getter.mjs is a go-getter verb in the main checkout even if the path does not resolve', () => {
  setup({ only: true });
  assert.equal(bash('node /nowhere/at/all/compiler/bin/go-getter.mjs pool acquire --branch x').denied, false);
  assert.equal(bash('node /nowhere/script.mjs').denied, true);
});

test('A2.4 a refusal says where a free slot is', () => {
  setup({ only: true });
  const slot = fx.freeSlot(1);
  const d = bash('npm test');
  assert.equal(d.denied, true);
  assert.ok(d.reason.includes(`A free slot is ready at ${slot}`), d.reason);
});
