// Roadmap G4 (decision 0159 item 3): a host whose capability says `gateFloor` runs state-dependent commands after a checkpoint,
// writes no native ask rule for them, and `go-getter coverage` states what that leaves unprotected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { HOSTS, loadCapabilities } from '../src/capabilities.mjs';
import { CATALOG, nativeRules } from '../src/gate.mjs';
import { evaluatePreTool } from '../src/hook.mjs';
import { listCheckpoints } from '../src/checkpoint.mjs';
import { readLog } from '../src/telemetry/record.mjs';
import { coverage, formatCoverage } from '../src/coverage.mjs';
import { loadPack } from '../src/packs.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const caps = loadCapabilities(root);
const FLOOR = ['copilot', 'kilo', 'opencode'];
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  generated-by: hitl@1\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

function setup({ checkpoint }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-floor-'));
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(dir, 'home');
  const work = path.join(dir, 'work');
  mkdirSync(path.join(work, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(work, 'docs/decisions'), { recursive: true });
  git(work, 'init', '-q', '-b', 'master');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false']]) git(work, 'config', k, v);
  writeFileSync(path.join(work, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(work, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  if (checkpoint) writeFileSync(path.join(work, 'docs/guardrails/checkpoint.md'), guardrail('checkpoint', 'builtin:checkpoint-before-gated triggers=gated-action'));
  writeFileSync(path.join(work, 'docs/decisions/0001-t.md'), '---\nid: 0001-t\ntitle: T\nstatus: active\ndate: 2026-10-10\ntags: [x]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\nx\n');
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'one');
  git(work, 'checkout', '-q', '-b', 'local');
  writeFileSync(path.join(work, 'only-here'), 'x');
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'two');
  git(work, 'checkout', '-q', 'master');
  return { work, cleanup: () => { saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved); rmSync(dir, { recursive: true, force: true }); } };
}
const UNSAFE = 'git branch -D local'; // its only commit exists nowhere else

test('the floor is declared for Copilot, Kilo and OpenCode alone', () => {
  for (const h of HOSTS) assert.equal(caps[h].hooks.gateFloor === true, FLOOR.includes(h), h);
});

test('no native ask rule is written for a state-dependent command on the floor hosts', () => {
  const stateful = CATALOG.filter((e) => e.stateful);
  assert.ok(stateful.length >= 4);
  for (const h of FLOOR) {
    const rules = nativeRules(h, stateful, caps);
    assert.ok(rules === null || (Array.isArray(rules) ? rules.length === 0 : Object.keys(rules).length === 0), h);
    const all = JSON.stringify(nativeRules(h, CATALOG, caps));
    for (const word of ['branch -D', 'reset --hard', 'rebase', 'worktree remove']) assert.ok(!all.includes(word), `${h} ${word}`);
  }
});

test('an unsafe state-dependent command runs on a floor host after a checkpoint, and is logged as a floor pass', (t) => {
  for (const host of FLOOR) {
    const { work, cleanup } = setup({ checkpoint: true });
    t.after(cleanup);
    const d = evaluatePreTool(work, bash(UNSAFE), host);
    assert.equal(d.deny, false, host);
    assert.equal(d.ask, undefined, host);
    assert.equal(listCheckpoints(work).length, 1, `${host} took a checkpoint`);
    const rec = readLog(work).find((r) => r.event === 'gate:stop');
    assert.deepEqual([rec.outcome, rec.trigger, rec.taskClass, rec.host], ['allowed', 'floor', 'git-branch-delete', host]);
    assert.ok(!JSON.stringify(rec).includes('local'), 'no command text in the log');
  }
});

test('the floor takes a checkpoint even when the project adopted no checkpoint trigger', (t) => {
  const { work, cleanup } = setup({ checkpoint: false });
  t.after(cleanup);
  assert.equal(evaluatePreTool(work, bash(UNSAFE), 'copilot').deny, false);
  assert.equal(listCheckpoints(work).length, 1);
});

test('hosts off the floor keep their stop, and the floor does not free commands that are not state-dependent', (t) => {
  const { work, cleanup } = setup({ checkpoint: true });
  t.after(cleanup);
  assert.equal(evaluatePreTool(work, bash(UNSAFE), 'cursor').deny, true);
  assert.equal(evaluatePreTool(work, bash(UNSAFE), 'claude-code').ask, true);
  assert.equal(evaluatePreTool(work, bash('git push --force origin master'), 'copilot').deny, true);
});

test('coverage states the tier per host and the residual risk', (t) => {
  const { work, cleanup } = setup({ checkpoint: true });
  t.after(cleanup);
  const packs = { hitl: loadPack(path.join(root, 'src/packs/hitl/pack.json')) };
  const rows = coverage(work, packs, caps);
  const out = formatCoverage(rows);
  assert.deepEqual(rows.find((r) => r.component === 8).stateTiers, { 'claude-code': 'ask', codex: 'hand-over', kilo: 'floor', opencode: 'floor', cursor: 'hand-over', 'gemini-cli': 'hand-over', copilot: 'floor' });
  assert.match(out, /State-dependent commands \(.*git-branch-delete.*\): claude-code ask a person.*; codex, cursor, gemini-cli stop and hand over.*; kilo, opencode, copilot run it after a checkpoint/);
  assert.match(out, /Residual risk on kilo, opencode, copilot: .*Not protected: commits that exist only on a deleted or rebased branch/);
});
