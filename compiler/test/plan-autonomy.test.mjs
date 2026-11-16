// Draft decision plan-autonomy: `plan start --auto`, `plan next --auto`, `plan attempt` and `plan stop` drive the run record, under the same person-only rules as `run`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { activeRun, runsFile } from '../src/runs/record.mjs';
import { evaluatePreTool } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const body = '### 1 First — [ ]\nIssue: #1\nClass: implement · Effort: low · Needs: none · Check: `true`\nDo: a.\nDone-when: a.\n';
const plan = (approval) => `# P — plan\n\n**Status legend**: x\n${approval ? `**Approval**: ${approval}\n` : ''}\n${body}`;

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-start-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/ok.md'), plan(''));
  writeFileSync(path.join(dir, 'docs/plans/forged.md'), plan('approved 2026-11-04 by Owner'));
  writeFileSync(path.join(dir, 'docs/plans/pending.md'), plan('pending'));
  writeFileSync(path.join(dir, 'docs/plans/none.md'), plan(''));
  writeFileSync(path.join(dir, 'ok.md'), plan('approved 2026-11-04 by Owner'));
  writeFileSync(path.join(dir, 'docs/decisions/0001-g.md'), '---\nid: 0001-g\ntitle: g\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  run-grants: git-push, pr-create\n---\n\n## Decision\n\nx\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Owner'], { cwd: dir });
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(cli, path.join(bin, 'go-getter'));
  const env = { ...process.env, GO_GETTER_HOME: path.join(base, 'home') };
  const approve = (name) => spawnSync(process.execPath, [cli, 'plan', 'approve', `docs/plans/${name}`], { cwd: dir, env, encoding: 'utf8' });
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = env.GO_GETTER_HOME;
  approve('ok.md');
  return {
    dir, env, approve,
    cli: (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' }),
    ask: (command, host = 'claude-code') => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, host),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('plan start --auto starts a run on an approved plan; next, attempt and stop drive it', () => {
  const s = setup();
  try {
    const started = s.cli('plan', 'start', '--auto', 'docs/plans/ok.md', '--hours', '2');
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /run started: plan docs\/plans\/ok\.md/);
    assert.ok(activeRun(s.dir));
    const next = s.cli('plan', 'next', '--auto');
    assert.equal(next.status, 0, next.stderr);
    assert.match(next.stdout, /next: step 1/);
    assert.match(s.cli('plan', 'attempt', '1').stdout, /attempt 1 recorded for step 1/);
    const stopped = s.cli('plan', 'stop');
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(activeRun(s.dir), null);
  } finally { s.cleanup(); }
});

test('plan start --auto refuses a plan that is not approved, and run is deprecated but works', () => {
  const s = setup();
  try {
    const refused = s.cli('plan', 'start', '--auto', 'docs/plans/pending.md');
    assert.equal(refused.status, 1);
    assert.equal(activeRun(s.dir), null);
    const legacy = s.cli('run', 'start', 'docs/plans/ok.md');
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.match(legacy.stderr, /deprecated, use go-getter plan start --auto/);
  } finally { s.cleanup(); }
});

test('an agent may plan start --auto an approved plan, but never --grant, stop, an unapproved plan or a chain', () => {
  const s = setup();
  try {
    for (const c of ['go-getter plan start --auto docs/plans/ok.md', 'go-getter plan start --auto docs/plans/ok.md --through 1 --hours 2']) assert.ok(!s.ask(c).deny, c);
    for (const c of ['go-getter plan start --auto docs/plans/ok.md --grant git-push', 'go-getter plan start --auto docs/plans/forged.md', 'go-getter plan start --auto docs/plans/ok.md && true', 'go-getter plan stop', 'go-getter run end']) {
      assert.ok(s.ask(c).deny, c);
    }
    assert.ok(!s.ask('go-getter plan start 1 docs/plans/ok.md').deny, 'a manual step start is not a run');
  } finally { s.cleanup(); }
});
