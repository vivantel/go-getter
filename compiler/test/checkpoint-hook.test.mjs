import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';
import { listCheckpoints } from '../src/checkpoint.mjs';
import { startStep } from '../src/plan.mjs';
import { LOG } from '../src/telemetry/record.mjs';

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

function project({ checkpoint = 'builtin:checkpoint-before-gated triggers=gated-action keep=10', telemetry = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-cphook-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  if (checkpoint) writeFileSync(path.join(dir, 'docs/guardrails/checkpoint-before-gated.md'), guardrail('checkpoint-before-gated', checkpoint));
  if (telemetry) {
    writeFileSync(path.join(dir, 'docs/decisions/0001-telemetry.md'), '---\nid: 0001-telemetry\ntitle: Telemetry\nstatus: active\ndate: 2026-10-10\ntags: [x]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\nx\n');
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  writeFileSync(path.join(dir, 'work.txt'), 'in progress\n');
  return dir;
}

const shell = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const cursor = (command) => ({ tool_name: 'Shell', tool_input: { command } });

test('a gated command takes a checkpoint on a native-ask host and on a hand-over host, and the decisions are unchanged', () => {
  const dir = project();
  assert.equal(evaluatePreTool(dir, shell('git push origin main'), 'claude-code').deny, false);
  assert.equal(listCheckpoints(dir).length, 1);
  assert.equal(evaluatePreTool(dir, cursor('git push --force'), 'cursor').deny, true);
  assert.equal(listCheckpoints(dir).length, 2);
  assert.ok(git(dir, 'ls-tree', '-r', '--name-only', listCheckpoints(dir)[0].ref).includes('work.txt'));
  rmSync(dir, { recursive: true, force: true });
});

test('a command that is not gated, or a project without the guardrail, takes none', () => {
  const dir = project();
  evaluatePreTool(dir, shell('git status'), 'claude-code');
  evaluatePreTool(dir, shell('npm test'), 'claude-code');
  assert.equal(listCheckpoints(dir).length, 0);
  const bare = project({ checkpoint: null });
  evaluatePreTool(bare, shell('git push'), 'claude-code');
  assert.equal(listCheckpoints(bare).length, 0);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
});

test('keep limits how many are kept', () => {
  const dir = project({ checkpoint: 'builtin:checkpoint-before-gated triggers=gated-action keep=2' });
  for (let i = 0; i < 4; i++) {
    writeFileSync(path.join(dir, 'work.txt'), `v${i}\n`);
    evaluatePreTool(dir, shell('git reset --hard'), 'claude-code');
  }
  assert.equal(listCheckpoints(dir).length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('a git failure never changes the decision', () => {
  const dir = project();
  const bin = path.join(dir, 'fake-bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}:${saved}`;
  try {
    assert.equal(evaluatePreTool(dir, shell('git push'), 'claude-code').deny, false);
    assert.equal(evaluatePreTool(dir, cursor('git push'), 'cursor').deny, true);
  } finally {
    process.env.PATH = saved;
  }
  rmSync(dir, { recursive: true, force: true });
});

test('the telemetry line holds the trigger and no command text', () => {
  const dir = project({ telemetry: true });
  evaluatePreTool(dir, shell('git push origin secret-branch-name'), 'claude-code');
  const lines = readFileSync(path.join(dir, LOG), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const line = lines.find((l) => l.event === 'checkpoint');
  assert.equal(line.trigger, 'gated-action');
  assert.equal(line.host, 'claude-code');
  assert.doesNotMatch(JSON.stringify(line), /secret-branch-name|push/);
  rmSync(dir, { recursive: true, force: true });
});

test('plan start takes a checkpoint only when plan-step is a trigger', () => {
  for (const [triggers, expected] of [['gated-action', 0], ['gated-action,plan-step', 1]]) {
    const dir = project({ checkpoint: `builtin:checkpoint-before-gated triggers=${triggers}` });
    const plan = path.join(dir, 'plan.md');
    writeFileSync(plan, '# Plan\n\n### 1 First — [ ]\nClass: implement · Needs: none · Check: true\nDo: x\nDone-when: y\n');
    startStep(dir, plan, '1');
    assert.equal(listCheckpoints(dir).length, expected, triggers);
    rmSync(dir, { recursive: true, force: true });
  }
});
