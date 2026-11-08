// Roadmap G3: a stop says what is lost, the safe alternative and how to approve and remember; each stop is logged as metadata.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool, evaluatePostTool } from '../src/hook.mjs';
import { readLog } from '../src/telemetry/record.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { offlineGh } from './support/offline-gh.mjs';

after(offlineGh());

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

// A repository with `local`, a branch whose commit exists nowhere else, so `git branch -D local` loses work.
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-stop-'));
  const home = path.join(dir, 'home');
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = home;
  const work = path.join(dir, 'work');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'master');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false']]) git(work, 'config', k, v);
  mkdirSync(path.join(work, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(work, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(work, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(work, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
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
const COMMAND = 'git branch -D local';

test('a stop on a host that can ask names the loss, the alternative and the remember choice', (t) => {
  const { work, cleanup } = setup();
  t.after(cleanup);
  const d = evaluatePreTool(work, bash(COMMAND), 'claude-code');
  assert.equal(d.ask, true);
  assert.match(d.reason, /Lost: .+/);
  assert.match(d.reason, /Instead: .*git branch -d/);
  assert.match(d.reason, /Approve: Yes runs it now and remembers this exact case .*go-getter approvals revoke stop:[0-9a-f]{16}/);
});

test('a stop on a host that cannot ask names the loss and the alternative and leaves the choice to a person', (t) => {
  const { work, cleanup } = setup();
  t.after(cleanup);
  const d = evaluatePreTool(work, bash(COMMAND), 'cursor');
  assert.equal(d.deny, true);
  assert.match(d.reason, /Lost: .+\n  Instead: .+\n  Approve: this needs a human: ask the user to run it themselves/);
});

test('a remembered approval is not asked twice, and a changed state asks again', (t) => {
  const { work, cleanup } = setup();
  t.after(cleanup);
  assert.equal(evaluatePreTool(work, bash(COMMAND), 'claude-code').ask, true);
  evaluatePostTool(work, { ...bash(COMMAND), tool_response: 'Deleted branch local' }); // the person said yes and the call ran
  const again = evaluatePreTool(work, bash(COMMAND), 'claude-code');
  assert.equal(again.ask, undefined);
  assert.equal(again.deny, false);
  git(work, 'checkout', '-q', 'local');
  writeFileSync(path.join(work, 'another'), 'y');
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'three');
  git(work, 'checkout', '-q', 'master');
  assert.equal(evaluatePreTool(work, bash(COMMAND), 'claude-code').ask, true, 'the state changed, so it is a new case');
});

test('each stop is logged as metadata with no command text', (t) => {
  const { work, cleanup } = setup();
  t.after(cleanup);
  evaluatePreTool(work, bash(COMMAND), 'claude-code');
  evaluatePreTool(work, bash(COMMAND), 'cursor');
  const stops = readLog(work).filter((r) => r.event === 'gate:stop');
  assert.deepEqual(stops.map((r) => [r.taskClass, r.outcome, r.trigger]), [['git-branch-delete', 'escalated', 'ask'], ['git-branch-delete', 'blocked', 'deny']]);
  const text = JSON.stringify(stops);
  assert.ok(!text.includes('local') && !text.includes('git branch'), 'no command text or branch name in the log');
  assert.ok(stops.every((r) => !('command' in r) && !('reason' in r)));
});
