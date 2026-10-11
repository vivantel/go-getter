import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { githubSource, issueStateOf, cleanTitle, originRepo } from '../src/trackers/github.mjs';
import { callSource } from '../src/trackers/worksource.mjs';
import { STATE_DIR } from '../src/telemetry/record.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { installGh } from './support/gh-stub.mjs';
import { runWorkSourceContract } from './support/worksource-contract.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const MARK = { pending: ' ', 'in progress': '~', done: 'x', blocked: '!', moved: '>' };
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env) });

// A project with a GitHub origin, a stub gh first on PATH and a plan whose steps are `[id, title, state, issue?, needs?]`.
function project(steps, data = { repo: 'acme/app', issues: [] }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-github-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  const file = path.join(dir, 'docs/plans/p.md');
  const body = steps.map(([id, title, state, issue, needs]) => `### ${id} ${title} — [${MARK[state]}]\n${issue ? `Issue: ${issue}\n` : ''}Needs: ${needs ?? 'none'}\nDone-when: ${title}.\n`);
  writeFileSync(file, `# Plan\n\n${body.join('\n')}`);
  const gh = installGh(dir, data);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${saved}`;
  return {
    dir,
    file,
    gh,
    source: githubSource(file, { project: dir, name: 'docs/plans/p.md', now: () => new Date('2026-10-11T12:00:00Z') }),
    cleanup: () => {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const list = async (p) => (await callSource(p.source, 'list')).result.steps;

// The shared contract, on a plan with no issues: the overlay must not change a thing or call gh.
runWorkSourceContract('github source (no issues)', (seed) => {
  const p = project(seed.map((s) => [s.id, s.title, s.state, undefined, s.needs.length ? s.needs.join(', ') : undefined]));
  return { source: p.source, cleanup: p.cleanup };
});

test('state mapping: closed as completed is done, as not planned is moved, anything else is open', () => {
  assert.equal(issueStateOf({ state: 'CLOSED', stateReason: 'COMPLETED' }), 'done');
  assert.equal(issueStateOf({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }), 'moved');
  assert.equal(issueStateOf({ state: 'CLOSED' }), 'done');
  assert.equal(issueStateOf({ state: 'OPEN' }), 'open');
  assert.equal(issueStateOf({ state: 'OPEN', stateReason: 'REOPENED' }), 'open');
});

test('a closed issue makes the step done and reports the file marker as a mismatch; the file is untouched', async () => {
  const p = project([['1', 'One', 'pending', '#11'], ['2', 'Two', 'pending']], { repo: 'acme/app', issues: [{ number: 11, title: 'One', state: 'CLOSED', stateReason: 'COMPLETED' }] });
  try {
    const before = readFileSync(p.file, 'utf8');
    const [one, two] = await list(p);
    assert.deepEqual([one.state, one.fileState, one.mismatch], ['done', 'pending', 'the issue is closed but the plan marks the step pending']);
    assert.deepEqual(one.issueState, { tracker: 'github', ref: 'acme/app#11', state: 'done', title: 'One', fetchedAt: '2026-10-11T12:00:00.000Z', stale: false });
    assert.equal(two.state, 'pending', 'a step without an issue stays file-driven');
    assert.equal(two.issueState, undefined);
    assert.equal(readFileSync(p.file, 'utf8'), before);
  } finally {
    p.cleanup();
  }
});

test('an open issue cannot be done: a step the file marks done shows in progress with a mismatch; not planned is moved', async () => {
  const p = project([['1', 'One', 'done', '#11'], ['2', 'Two', 'in progress', 'acme/app#12'], ['3', 'Three', 'pending', 'https://github.com/acme/app/issues/13']], {
    repo: 'acme/app',
    issues: [{ number: 11, title: 'a', state: 'OPEN' }, { number: 12, title: 'b', state: 'OPEN' }, { number: 13, title: 'c', state: 'CLOSED', stateReason: 'NOT_PLANNED' }],
  });
  try {
    const [one, two, three] = await list(p);
    assert.deepEqual([one.state, one.fileState, one.mismatch], ['in progress', 'done', 'the plan marks the step done but its issue is open']);
    assert.deepEqual([two.state, two.mismatch], ['in progress', undefined]);
    assert.deepEqual([three.state, three.fileState], ['moved', 'pending']);
  } finally {
    p.cleanup();
  }
});

test('four or more issues in a repository cost one list call, fewer cost one view each', async () => {
  const issues = [1, 2, 3, 4, 5].map((n) => ({ number: n, title: `t${n}`, state: 'OPEN' }));
  const many = project([1, 2, 3, 4, 5].map((n) => [String(n), `S${n}`, 'pending', `#${n}`]), { repo: 'acme/app', issues });
  try {
    await list(many);
    assert.deepEqual(many.gh.calls().map((c) => c.slice(0, 2).join(' ')), ['issue list']);
  } finally {
    many.cleanup();
  }
  const few = project([['1', 'S1', 'pending', '#1'], ['2', 'S2', 'pending', '#2']], { repo: 'acme/app', issues });
  try {
    await list(few);
    assert.deepEqual(few.gh.calls().map((c) => c.slice(0, 3).join(' ')).sort(), ['issue view 1', 'issue view 2']);
  } finally {
    few.cleanup();
  }
});

test('a plan with no GitHub issue never calls gh; a Jira reference is left alone', async () => {
  const p = project([['1', 'One', 'pending'], ['PROJ-2', 'Two', 'pending', 'PROJ-2']]);
  try {
    const steps = await list(p);
    assert.deepEqual(steps.map((s) => s.state), ['pending', 'pending']);
    assert.deepEqual(p.gh.calls(), []);
  } finally {
    p.cleanup();
  }
});

test('when gh fails the last state read is used and marked stale; with none the file state stays and is marked stale', async () => {
  const p = project([['1', 'One', 'pending', '#11'], ['2', 'Two', 'pending', '#12']], { repo: 'acme/app', issues: [{ number: 11, title: 'One', state: 'CLOSED', stateReason: 'COMPLETED' }, { number: 12, title: 'Two', state: 'OPEN' }] });
  try {
    await list(p); // fills the cache
    assert.ok(existsSync(path.join(p.dir, STATE_DIR, 'tracker-cache.json')));
    p.gh.setData({ repo: 'acme/app', issues: [], fail: true });
    const [one, two] = await list(p);
    assert.deepEqual([one.state, one.issueState.stale, one.issueState.fetchedAt], ['done', true, '2026-10-11T12:00:00.000Z']);
    assert.deepEqual([two.state, two.issueState.state, two.issueState.stale], ['pending', 'open', true]);
    rmSync(path.join(p.dir, STATE_DIR), { recursive: true, force: true });
    const [cold] = await list(p);
    assert.deepEqual([cold.state, cold.issueState.state, cold.issueState.stale], ['pending', 'unknown', true]);
  } finally {
    p.cleanup();
  }
});

test('an issue that does not exist is unknown, not stale, and leaves the step as the file has it', async () => {
  const p = project([['1', 'One', 'pending', '#99']], { repo: 'acme/app', issues: [{ number: 1, title: 'x', state: 'OPEN' }] });
  try {
    const [one] = await list(p);
    assert.deepEqual([one.state, one.issueState.state, one.issueState.stale], ['pending', 'unknown', false]);
  } finally {
    p.cleanup();
  }
});

test('an issue title is untrusted: control characters go, a secret is redacted, a long title is cut', () => {
  assert.equal(cleanTitle('Fix\nthe\u0000thing now'), 'Fix the thing now');
  const token = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
  assert.equal(cleanTitle(`leak ${token} here`), 'leak [redacted] here');
  const long = cleanTitle('x'.repeat(500));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
});

test('a title with a secret never reaches the cache or the step', async () => {
  const token = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
  const p = project([['1', 'One', 'pending', '#11']], { repo: 'acme/app', issues: [{ number: 11, title: `rotate ${token}`, state: 'OPEN' }] });
  try {
    const [one] = await list(p);
    assert.equal(one.issueState.title, 'rotate [redacted]');
    assert.ok(!readFileSync(path.join(p.dir, STATE_DIR, 'tracker-cache.json'), 'utf8').includes(token));
  } finally {
    p.cleanup();
  }
});

test('originRepo reads the GitHub remote in https and ssh form and nothing else', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-github-'));
  git(dir, 'init', '-q');
  assert.equal(originRepo(dir), null);
  try {
    for (const [url, want] of [['https://github.com/a-b/c.d.git', 'a-b/c.d'], ['git@github.com:a/b.git', 'a/b'], ['https://github.com/a/b', 'a/b'], ['https://gitlab.com/a/b.git', null]]) {
      spawnSync('git', ['remote', 'remove', 'origin'], { cwd: dir, env: cleanGitEnv(process.env) });
      git(dir, 'remote', 'add', 'origin', url);
      assert.equal(originRepo(dir), want, url);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan status shows the issue state, the mismatch and the stale label; plan start refuses a need whose issue is open', () => {
  const p = project([['1', 'One', 'done', '#11'], ['2', 'Two', 'pending', undefined, '1']], { repo: 'acme/app', issues: [{ number: 11, title: 'One', state: 'OPEN' }] });
  try {
    const run = (...a) => spawnSync(process.execPath, [cli, 'plan', ...a, 'docs/plans/p.md'], { cwd: p.dir, encoding: 'utf8', env: process.env });
    const status = run('status');
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /\[~\] 1 One \(mismatch: the plan marks the step done but its issue is open\)/);
    const start = run('start', '2');
    assert.equal(start.status, 1);
    assert.match(start.stderr, /step 2 needs 1, not done yet/);
    p.gh.setData({ repo: 'acme/app', issues: [], fail: true });
    assert.match(run('status').stdout, /issue state as of \d{4}-\d\d-\d\dT[\d:.]+Z, stale/);
    p.gh.setData({ repo: 'acme/app', issues: [{ number: 11, title: 'One', state: 'CLOSED', stateReason: 'COMPLETED' }] });
    assert.match(run('start', '2').stdout, /2: \[~\]/);
  } finally {
    p.cleanup();
  }
});
