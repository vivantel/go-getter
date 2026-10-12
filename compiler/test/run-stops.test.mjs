// Stop rules of an autonomous run (decision 0130 items 6-8, step 4 of the autonomous-run plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';
import { startRun, activeRun } from '../src/runs/record.mjs';
import { nextInRun } from '../src/runs/next.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const step = (i, extra = '', marker = ' ') => `### ${i} Step ${i} — [${marker}]\nClass: implement · Effort: low · Needs: none · Check: \`true\`${extra}\nDo: x.\nDone-when: done ${i}.\n`;
const PLAN = (steps) => `# P — plan\n\n**Status legend**: x\n\n${steps.join('\n')}`;
const GATE = 'builtin:gate-command classes=irreversible,outward';

function setup(plan = PLAN([step(1), step(2), step(3)])) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-stops-')));
  const dir = path.join(base, 'proj');
  for (const rel of ['docs/guardrails', 'docs/plans']) mkdirSync(path.join(dir, rel), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), plan);
  writeFileSync(path.join(dir, 'docs/guardrails/gated.md'), `---\nid: gated\ntitle: gated\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: gated\n      run: "${GATE}"\n---\n\n## Guardrail\n\nAsk.\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    dir,
    start: (opts = {}) => startRun(dir, { plan: 'docs/plans/p.md', steps: ['1', '2', '3'], ...opts }),
    cli: (...args) => spawnSync('node', [cli, ...args], { cwd: dir, encoding: 'utf8', env: process.env }),
    cleanup: () => {
      saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('without a run there is nothing to do next', () => {
  const s = setup();
  try {
    assert.equal(nextInRun(s.dir).stop.code, 'no-run');
  } finally { s.cleanup(); }
});

test('next gives the first step not done and the finished range reports done', () => {
  const s = setup(PLAN([step(1, '', 'x'), step(2), step(3)]));
  try {
    s.start();
    const r = nextInRun(s.dir);
    assert.equal(r.step.id, '2');
    assert.equal(r.step.check, 'true');
    writeFileSync(path.join(s.dir, 'docs/plans/p.md'), PLAN([step(1, '', 'x'), step(2, '', 'x'), step(3, '', 'x')]));
    assert.deepEqual(nextInRun(s.dir), { done: true });
  } finally { s.cleanup(); }
});

test('a step needing a human stops the run and is never skipped for a later step', () => {
  const s = setup(PLAN([step(1), step(2, ' · Human: owner decision'), step(3)]));
  try {
    s.start();
    writeFileSync(path.join(s.dir, 'docs/plans/p.md'), PLAN([step(1, '', 'x'), step(2, ' · Human: owner decision'), step(3)]));
    const r = nextInRun(s.dir);
    assert.equal(r.stop.code, 'human-needed');
    assert.equal(r.stop.step, '2');
    assert.match(r.stop.reason, /owner decision/);
    assert.equal(activeRun(s.dir).stop.code, 'human-needed', 'the stop is recorded for the report');
    const blocked = setup(PLAN([step(1, '', '!'), step(2)]));
    try {
      blocked.start({ steps: ['1', '2'] });
      assert.equal(nextInRun(blocked.dir).stop.code, 'human-needed');
    } finally { blocked.cleanup(); }
  } finally { s.cleanup(); }
});

test('two failed fix attempts on one step stop the run; another step is not charged', () => {
  const s = setup();
  try {
    s.start();
    assert.equal(s.cli('run', 'attempt', '1').status, 0);
    assert.equal(nextInRun(s.dir).step.id, '1');
    s.cli('run', 'attempt', '1');
    const r = nextInRun(s.dir);
    assert.equal(r.stop.code, 'red-attempts');
    assert.equal(r.stop.step, '1');
    assert.deepEqual(activeRun(s.dir).counters.attempts, { 1: 2 });
    assert.notEqual(s.cli('run', 'attempt', '9').status, 0, 'a step outside the range is refused');
    const out = s.cli('run', 'next');
    assert.equal(out.status, 1);
    assert.match(out.stdout, /stop \(red-attempts\)/);
  } finally { s.cleanup(); }
});

test('a denial inside a run is recorded by guardrail and a repeat on one step stops the run', () => {
  const s = setup();
  try {
    s.start();
    const force = () => evaluatePreTool(s.dir, { tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }, 'codex');
    assert.ok(force().deny);
    assert.equal(nextInRun(s.dir).step.id, '1', 'one denial does not stop');
    assert.deepEqual(activeRun(s.dir).counters.denials, { 1: { gated: 1 } });
    assert.ok(force().deny);
    const r = nextInRun(s.dir);
    assert.equal(r.stop.code, 'repeated-denial');
    assert.match(r.stop.reason, /gated/);
  } finally { s.cleanup(); }
});

test('the spend cap stops the run from the telemetry cost since it started', () => {
  const s = setup();
  try {
    s.start({ spendCapUsd: 1 });
    mkdirSync(path.join(s.dir, '.go-getter/state'), { recursive: true });
    const line = (cost) => JSON.stringify({ ts: new Date(Date.now() + 1000).toISOString(), event: 'step', cost });
    writeFileSync(path.join(s.dir, '.go-getter/state/telemetry.jsonl'), `${line(0.4)}\n`);
    assert.equal(nextInRun(s.dir).step.id, '1');
    writeFileSync(path.join(s.dir, '.go-getter/state/telemetry.jsonl'), `${line(0.4)}\n${line(0.7)}\n`);
    assert.equal(nextInRun(s.dir).stop.code, 'spend-cap');
  } finally { s.cleanup(); }
});

test('the hook still refuses an agent starting or ending a run, and run attempt is allowed', () => {
  const s = setup();
  try {
    const ask = (command) => evaluatePreTool(s.dir, { tool_name: 'Bash', tool_input: { command } }, 'codex');
    assert.ok(ask('go-getter run end').deny);
    assert.ok(!ask('go-getter run attempt 1').deny);
    assert.ok(!ask('go-getter run next').deny);
    assert.match(readFileSync(path.join(root, 'compiler/src/commands/run.mjs'), 'utf8'), /next \[--json\] \| attempt/);
  } finally { s.cleanup(); }
});
