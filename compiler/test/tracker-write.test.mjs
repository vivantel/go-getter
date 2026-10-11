import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planIssue, writeMode, describeRequest } from '../src/trackers/write.mjs';
import { readLog, LOG } from '../src/telemetry/record.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { installGh } from './support/gh-stub.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env) });
const FAKE_TOKEN = `ghp_${'a1B2c3D4e5'.repeat(4)}`;

const PLAN = `# Plan

### 1 First step — [x]
Class: implement · Needs: none · Check: \`true\`
Do: build the first thing.
Done-when: the first thing exists.

### 2 Second step — [ ]
Issue: #7
Needs: 1
Done-when: the second thing exists.

### 3 Leaky step — [ ]
Do: rotate ${FAKE_TOKEN} somewhere.
`;

// A project with a GitHub origin, a stub gh on PATH, telemetry on and the tracker write answer `mode` (null: no tracker pack).
function project(mode, data = { repo: 'acme/app', issues: [{ number: 7, title: 'Second', state: 'OPEN' }] }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-write-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN);
  writeFileSync(path.join(dir, 'docs/decisions/0001-telemetry.md'), '---\nid: 0001-telemetry\ntitle: Telemetry\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\nx\n');
  if (mode) writeFileSync(path.join(dir, 'docs/decisions/0002-tracker-writes.md'), `---\nid: 0002-tracker-writes\ntitle: Tracker writes\nstatus: active\ndate: 2026-10-11\ntags: [x]\ngo-getter:\n  tracker-writes: ${mode}\n---\n\nx\n`);
  const gh = installGh(dir, data);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${saved}`;
  const file = path.join(dir, 'docs/plans/p.md');
  return {
    dir,
    file,
    gh,
    run: (verb, id, opts) => planIssue(dir, file, 'docs/plans/p.md', verb, id, opts),
    cleanup: () => {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('the write answer is off unless an adopted decision says ask or allow', () => {
  for (const [mode, want] of [[null, 'off'], ['ask', 'ask'], ['allow', 'allow'], ['everything', 'off']]) {
    const p = project(mode);
    try {
      assert.equal(writeMode(p.dir), want, String(mode));
    } finally {
      p.cleanup();
    }
  }
});

test('a dry run sends nothing, whatever the answer, and prints the request', async () => {
  for (const mode of [null, 'ask']) {
    const p = project(mode);
    try {
      const r = await p.run('create', '2', { dryRun: true });
      assert.deepEqual([r.ok, r.dryRun], [false, undefined], 'step 2 already has an issue');
      const c = await p.run('comment', '2', { dryRun: true, text: 'hello' });
      assert.equal(c.ok, true);
      assert.match(c.message, /would comment on acme\/app#7/);
      assert.match(c.message, /hello/);
      assert.equal((await p.run('close', '2', { dryRun: true })).message.split('\n')[0], `would close acme/app#7 as completed (writes: ${mode ?? 'off'})`);
      assert.deepEqual(p.gh.calls(), []);
      assert.equal(readFileSync(p.file, 'utf8'), PLAN);
    } finally {
      p.cleanup();
    }
  }
});

test('with the answer off every verb is blocked and nothing is sent', async () => {
  const p = project(null);
  try {
    const r = await p.run('comment', '2', { text: 'hello' });
    assert.deepEqual([r.ok, r.blocked], [false, true]);
    assert.match(r.error, /writes are off/);
    assert.deepEqual(p.gh.calls(), []);
    assert.deepEqual(readLog(p.dir).map((l) => [l.event, l.outcome]), [['plan-issue:comment', 'blocked']]);
  } finally {
    p.cleanup();
  }
});

test('create sends the step text once, then writes the issue onto the step', async () => {
  const p = project('ask');
  try {
    const r = await p.run('create', '1');
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(p.gh.calls().map((c) => c.slice(0, 2).join(' ')), ['issue create']);
    const [sent] = p.gh.inputs();
    assert.deepEqual(sent.args, ['issue', 'create', '--repo', 'acme/app', '--title', 'First step', '--body-file', '-']);
    assert.equal(sent.stdin, 'Do: build the first thing.\nDone-when: the first thing exists.\n\nPlan step: docs/plans/p.md step 1');
    assert.ok(!sent.stdin.includes('Check:') && !sent.stdin.includes('Needs:'), 'metadata and the check command stay in the plan');
    assert.match(readFileSync(p.file, 'utf8'), /### 1 First step — \[x\]\nIssue: #8\nClass: implement/);
    assert.equal((await p.run('create', '1')).ok, false, 'a second create is refused: the step has an issue now');
    assert.equal(p.gh.calls().length, 1);
  } finally {
    p.cleanup();
  }
});

test('text with a secret or personal data is refused before anything is sent, and says the kind, never the value', async () => {
  const p = project('allow');
  try {
    const r = await p.run('create', '3');
    assert.deepEqual([r.ok, r.blocked], [false, true]);
    assert.match(r.error, /contains github/);
    assert.ok(!r.error.includes(FAKE_TOKEN));
    const c = await p.run('comment', '2', { text: 'mail me at someone@example.org' });
    assert.match(c.error, /contains email/);
    assert.deepEqual(p.gh.calls(), []);
    assert.deepEqual(readLog(p.dir).map((l) => l.outcome), ['blocked', 'blocked']);
  } finally {
    p.cleanup();
  }
});

test('comment and close go to the step issue; close with a reason; a step with no issue is refused', async () => {
  const p = project('ask');
  try {
    assert.equal((await p.run('comment', '2', { text: 'status update' })).ok, true);
    assert.deepEqual(p.gh.inputs().at(-1), { args: ['issue', 'comment', '7', '--repo', 'acme/app', '--body-file', '-'], stdin: 'status update' });
    assert.equal((await p.run('close', '2', { reason: 'not-planned' })).message, 'closed acme/app#7 as not planned');
    assert.equal(p.gh.data().issues[0].stateReason, 'NOT_PLANNED');
    assert.match((await p.run('close', '1')).error, /no issue; run plan issue create first/);
    assert.match((await p.run('close', '2', { reason: 'whatever' })).error, /--reason is completed or not-planned/);
    assert.match((await p.run('comment', '2', { text: '  ' })).error, /needs text/);
    assert.match((await p.run('comment', '9', { text: 'x' })).error, /no step 9/);
  } finally {
    p.cleanup();
  }
});

test('telemetry holds the verb and the outcome, never issue text', async () => {
  const p = project('ask');
  try {
    await p.run('comment', '2', { text: 'a very private remark about the roadmap' });
    await p.run('create', '1');
    const log = readFileSync(path.join(p.dir, LOG), 'utf8');
    assert.ok(!log.includes('private') && !log.includes('First step') && !log.includes('roadmap'));
    assert.deepEqual(readLog(p.dir).map((l) => [l.event, l.outcome]), [['plan-issue:comment', 'pass'], ['plan-issue:create', 'pass']]);
  } finally {
    p.cleanup();
  }
});

test('a gh failure is reported and recorded as fail, with the step unchanged', async () => {
  const p = project('ask', { repo: 'acme/app', issues: [], fail: true });
  try {
    const r = await p.run('create', '1');
    assert.equal(r.ok, false);
    assert.match(r.error, /^gh failed: gh: error connecting/);
    assert.equal(readFileSync(p.file, 'utf8'), PLAN);
    assert.deepEqual(readLog(p.dir).map((l) => l.outcome), ['fail']);
  } finally {
    p.cleanup();
  }
});

test('closing the issue after the step is done leaves plan status with no mismatch', async () => {
  const p = project('ask', { repo: 'acme/app', issues: [{ number: 7, title: 'Second', state: 'OPEN' }] });
  try {
    writeFileSync(p.file, readFileSync(p.file, 'utf8').replace('### 2 Second step — [ ]', '### 2 Second step — [x]').replace(/### 3[\s\S]*$/, ''));
    const status = () => spawnSync(process.execPath, [cli, 'plan', 'status', 'docs/plans/p.md'], { cwd: p.dir, encoding: 'utf8' }).stdout;
    assert.match(status(), /mismatch: the plan marks the step done but its issue is open/);
    assert.equal((await p.run('close', '2')).ok, true);
    const after = status();
    assert.ok(!after.includes('mismatch'), after);
    assert.match(after, /2\/2 done/);
  } finally {
    p.cleanup();
  }
});

test('plan issue on the command line: usage errors exit 2, a dry run prints and exits 0', () => {
  const p = project('ask');
  try {
    const run = (...a) => spawnSync(process.execPath, [cli, 'plan', 'issue', ...a], { cwd: p.dir, encoding: 'utf8', env: process.env });
    assert.equal(run().status, 2);
    assert.equal(run('delete', '1').status, 2);
    assert.equal(run('comment', '2', '--text').status, 2);
    assert.equal(run('comment', '2', '--text', 'a', '--stdin').status, 2);
    const lead = run('--dry-run', 'comment', '2', '--text', 'hi');
    assert.equal(lead.status, 0, lead.stderr);
    assert.match(lead.stdout, /^would comment on acme\/app#7/);
    assert.deepEqual(p.gh.calls(), [], 'a leading --dry-run sends nothing');
    assert.equal(run('--text', 'x', 'comment', '2').status, 2, 'any other flag before the verb is a usage error');
    const dry = run('create', '1', 'docs/plans/p.md', '--dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^would create an issue in acme\/app \(writes: ask\)\ntitle: First step/);
    const c = spawnSync(process.execPath, [cli, 'plan', 'issue', 'comment', '2', '--stdin'], { cwd: p.dir, encoding: 'utf8', env: process.env, input: 'from stdin' });
    assert.equal(c.status, 0, c.stderr);
    assert.equal(p.gh.inputs().at(-1).stdin, 'from stdin');
    assert.equal(describeRequest({ verb: 'close', repo: 'a/b', number: '1', reason: 'completed' }, 'allow'), 'would close a/b#1 as completed (writes: allow)');
  } finally {
    p.cleanup();
  }
});
