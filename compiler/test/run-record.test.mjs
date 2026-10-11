// The run record (decision 0130, step 1 of the autonomous-run plan): start, status and end, expiry, one run at a time, the
// store's permissions, and the pre-tool hook refusing an agent that tries to start or end a run or to write the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { activeRun, lastRun, startRun, endRun, runsFile } from '../src/runs/record.mjs';
import { evaluatePreTool } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const PLAN = `# P — plan

**Status legend**: x

### 1 First — [x]
Issue: #1
Class: implement · Effort: low · Needs: none · Check: \`true\`
Do: a.
Done-when: a.

### 2 Second — [ ]
Issue: #2
Class: implement · Effort: low · Needs: 1 · Check: \`true\`
Do: b.
Done-when: b.

### 3 Third — [ ]
Issue: #3
Class: implement · Effort: low · Needs: 2 · Check: \`true\`
Do: c.
Done-when: c.

### 4 Fourth — [ ]
Issue: #4
Class: implement · Effort: low · Needs: 3 · Check: \`true\`
Do: d.
Done-when: d.
`;

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-run-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(cli, path.join(bin, 'go-getter'));
  const home = path.join(base, 'home');
  const env = { ...process.env, GO_GETTER_HOME: home };
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = home;
  return {
    base, dir, home, env,
    cli: (...args) => spawnSync(process.execPath, [cli, 'run', ...args], { cwd: dir, env, encoding: 'utf8' }),
    ask: (command) => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, 'claude-code'),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('start covers the steps not yet done up to --through, status shows it and end closes it', () => {
  const s = setup();
  try {
    assert.match(s.cli('status').stdout, /no run is active/);
    const start = s.cli('start', 'docs/plans/p.md', '--through', '3', '--grant', 'pr-merge');
    assert.equal(start.status, 0, start.stderr);
    assert.match(start.stdout, /steps 2, 3 \(through 3\)/);
    const status = JSON.parse(s.cli('status', '--json').stdout);
    assert.deepEqual([status.active.plan, status.active.steps, status.active.grants], ['docs/plans/p.md', ['2', '3'], ['pr-merge']]);
    const end = s.cli('end');
    assert.equal(end.status, 0, end.stderr);
    assert.match(s.cli('status').stdout, /no run is active/);
    assert.equal(JSON.parse(s.cli('status', '--json').stdout).last.endReason, 'ended');
    assert.equal(s.cli('end').status, 1, 'ending with no run says so');
  } finally {
    s.cleanup();
  }
});

test('a second run is refused while one is active, and allowed once it ended', () => {
  const s = setup();
  try {
    assert.equal(s.cli('start', 'docs/plans/p.md').status, 0);
    const second = s.cli('start', 'docs/plans/p.md');
    assert.equal(second.status, 1);
    assert.match(second.stderr, /a run is already active for this project/);
    s.cli('end');
    assert.equal(s.cli('start', 'docs/plans/p.md', '--through', '2').status, 0);
  } finally {
    s.cleanup();
  }
});

test('start refuses an unknown step, a missing plan, a bad grant and a bad timeout', () => {
  const s = setup();
  try {
    assert.match(s.cli('start', 'docs/plans/p.md', '--through', '9').stderr, /no step 9/);
    assert.match(s.cli('start', 'docs/plans/p.md', '--grant', 'git-push-force').stderr, /--grant takes outward catalog ids/);
    assert.match(s.cli('start', 'docs/plans/p.md', '--hours', '500').stderr, /at most 72 hours/);
    assert.match(s.cli('start', 'docs/plans/missing.md').stderr, /no plan at/);
    assert.equal(s.cli('start').status, 2);
    assert.equal(s.cli('status').status, 0);
  } finally {
    s.cleanup();
  }
});

test('a run expires at its timeout and a new one can start', () => {
  const s = setup();
  try {
    const t0 = new Date('2026-10-11T10:00:00Z');
    startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['2'], hours: 2 }, { env: s.env, now: () => t0 });
    assert.ok(activeRun(s.dir, { env: s.env, now: () => new Date('2026-10-11T11:59:59Z') }));
    assert.equal(activeRun(s.dir, { env: s.env, now: () => new Date('2026-10-11T12:00:00Z') }), null);
    const last = lastRun(s.dir, { env: s.env, now: () => new Date('2026-10-11T12:30:00Z') });
    assert.deepEqual([last.endReason, last.endedAt], ['timeout', '2026-10-11T12:00:00.000Z']);
    assert.doesNotThrow(() => startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['3'] }, { env: s.env, now: () => new Date('2026-10-11T12:30:00Z') }));
    assert.equal(endRun(s.dir, { env: s.env, now: () => new Date('2026-10-11T13:00:00Z') }).endReason, 'ended');
  } finally {
    s.cleanup();
  }
});

test('the store is private, per project, and a damaged file reads as no run', () => {
  const s = setup();
  try {
    startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['2'] }, { env: s.env });
    assert.equal(statSync(runsFile(s.env)).mode & 0o777, 0o600);
    assert.equal(statSync(path.dirname(runsFile(s.env))).mode & 0o777, 0o700);
    const other = path.join(s.base, 'other');
    mkdirSync(other);
    assert.equal(activeRun(other, { env: s.env }), null, 'another project has no run');
    writeFileSync(runsFile(s.env), '{ not json');
    assert.equal(activeRun(s.dir, { env: s.env }), null);
    assert.doesNotThrow(() => startRun(s.dir, { plan: 'docs/plans/p.md', steps: ['2'] }, { env: s.env }));
    assert.equal(JSON.parse(readFileSync(runsFile(s.env), 'utf8')).version, 1);
  } finally {
    s.cleanup();
  }
});

test('the pre-tool hook denies an agent that starts or ends a run, however go-getter is spelled, and one that writes the store', () => {
  const s = setup();
  try {
    for (const command of ['go-getter run start docs/plans/p.md', 'go-getter run end', `node ${cli} run start docs/plans/p.md`, 'npx go-getter run start docs/plans/p.md', 'cd . && go-getter run end']) {
      const d = s.ask(command);
      assert.equal(d.deny, true, command);
      assert.match(d.reason, /a person runs it/);
    }
    assert.ok(!s.ask('go-getter run status').deny, 'status is read only');
    const store = path.dirname(runsFile(s.env));
    for (const tool of [{ tool_name: 'Write', tool_input: { file_path: `${store}/runs.json`, content: '{}' } }, { tool_name: 'Read', tool_input: { file_path: `${store}/runs.json` } }, { tool_name: 'Bash', tool_input: { command: `echo {} > ${store}/runs.json` } }]) {
      assert.equal(evaluatePreTool(s.dir, tool, 'claude-code').deny, true, JSON.stringify(tool));
    }
  } finally {
    s.cleanup();
  }
});
