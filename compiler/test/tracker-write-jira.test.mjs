import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planIssue } from '../src/trackers/write.mjs';
import { chooseTransition } from '../src/trackers/jira-write.mjs';
import { readLog, LOG } from '../src/telemetry/record.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const EMAIL = 'dev@example.test';
const TOKEN = `ATATT3xFfGF0${'a1B2c3D4e5'.repeat(5)}`;
const BASIC = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;
const transition = (id, name, category) => ({ id, name, to: { name, statusCategory: { key: category } } });

// A local HTTP server standing in for Jira that records every request with its body. `handler(req, body)` answers.
async function jira(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
      const answer = handler({ method: req.method, url: req.url, body }) ?? { status: 404, body: {} };
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

const PLAN = `# Plan

### 1 First step — [ ]
Class: implement · Needs: none
Do: build the first thing.
Done-when: the first thing exists.

### 2 Second step — [ ]
Issue: PROJ-7
Done-when: two.

### 3 Leaky step — [ ]
Do: rotate ${TOKEN} somewhere.
`;

// A project answering the tracker pack with jira: `extra` adds keys to the Jira configuration.
function project(mode, server, extra = {}, tracker = 'jira') {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-jira-write-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: cleanGitEnv(process.env) });
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN);
  writeFileSync(path.join(dir, 'docs/decisions/0001-telemetry.md'), '---\nid: 0001-telemetry\ntitle: Telemetry\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\nx\n');
  const cfg = { site: server.url, project: 'PROJ', 'email-env': 'GG_TEST_EMAIL', 'token-env': 'GG_TEST_TOKEN', ...extra };
  const yaml = Object.entries(cfg).map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`).join('\n');
  writeFileSync(path.join(dir, 'docs/decisions/0002-tracker.md'), `---\nid: 0002-tracker\ntitle: Tracker\nstatus: active\ndate: 2026-10-11\ntags: [x]\ngo-getter:\n  tracker: ${tracker}\n  tracker-writes: ${mode}\n  tracker-jira:\n${yaml}\n---\n\nx\n`);
  const savedEmail = process.env.GG_TEST_EMAIL;
  const savedToken = process.env.GG_TEST_TOKEN;
  process.env.GG_TEST_EMAIL = EMAIL;
  process.env.GG_TEST_TOKEN = TOKEN;
  const file = path.join(dir, 'docs/plans/p.md');
  return {
    dir,
    file,
    run: (verb, id, opts) => planIssue(dir, file, 'docs/plans/p.md', verb, id, opts),
    cleanup: () => {
      for (const [k, v] of [['GG_TEST_EMAIL', savedEmail], ['GG_TEST_TOKEN', savedToken]]) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('create opens a Jira issue from the step text and writes its key onto the step', async () => {
  const server = await jira(({ method, url }) => (method === 'POST' && url === '/rest/api/2/issue' ? { status: 201, body: { id: '1001', key: 'PROJ-45' } } : null));
  const p = project('ask', server);
  try {
    const r = await p.run('create', '1');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.message, 'created PROJ-45 in Jira; Issue: PROJ-45 written to step 1 in docs/plans/p.md');
    assert.equal(server.requests.length, 1);
    const [sent] = server.requests;
    assert.equal(sent.authorization, BASIC);
    assert.deepEqual(sent.body, { fields: { project: { key: 'PROJ' }, summary: 'First step', description: 'Do: build the first thing.\nDone-when: the first thing exists.\n\nPlan step: docs/plans/p.md step 1', issuetype: { name: 'Task' } } });
    assert.match(readFileSync(p.file, 'utf8'), /### 1 First step — \[ \]\nIssue: PROJ-45\nClass: implement/);
    assert.equal((await p.run('create', '1')).ok, false, 'the step has an issue now');
    assert.equal(server.requests.length, 1);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('create uses the configured issue type and refuses without a project key', async () => {
  const server = await jira(() => ({ status: 201, body: { key: 'PROJ-1' } }));
  const typed = project('allow', server, { 'issue-type': 'Story' });
  const keyless = project('allow', server, { project: '' });
  try {
    assert.equal((await typed.run('create', '1')).ok, true);
    assert.equal(server.requests[0].body.fields.issuetype.name, 'Story');
    const r = await keyless.run('create', '1');
    assert.match(r.error, /name no Jira project key/);
    assert.equal(server.requests.length, 1);
  } finally {
    typed.cleanup();
    keyless.cleanup();
    await server.close();
  }
});

test('comment posts the text to the step issue', async () => {
  const server = await jira(({ method, url }) => (method === 'POST' && url === '/rest/api/2/issue/PROJ-7/comment' ? { status: 201, body: { id: '9' } } : null));
  const p = project('ask', server);
  try {
    const r = await p.run('comment', '2', { text: 'status update' });
    assert.deepEqual([r.ok, r.message], [true, 'commented on PROJ-7']);
    assert.deepEqual(server.requests[0].body, { body: 'status update' });
    assert.equal((await p.run('comment', '1', { text: 'x' })).ok, false, 'a step with no issue');
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('close takes the single transition into the done category and posts it', async () => {
  const server = await jira(({ method, url }) => {
    if (url === '/rest/api/2/issue/PROJ-7/transitions' && method === 'GET') return { status: 200, body: { transitions: [transition('11', 'Start progress', 'indeterminate'), transition('31', 'Finish', 'done')] } };
    if (url === '/rest/api/2/issue/PROJ-7/transitions' && method === 'POST') return { status: 204 };
    return null;
  });
  const p = project('ask', server);
  try {
    const r = await p.run('close', '2');
    assert.deepEqual([r.ok, r.message], [true, 'closed PROJ-7 by the "Finish" transition']);
    assert.deepEqual(server.requests.map((q) => q.method), ['GET', 'POST']);
    assert.deepEqual(server.requests[1].body, { transition: { id: '31' } });
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('close with two transitions into done refuses and lists both, unless the configuration names one', async () => {
  const two = { status: 200, body: { transitions: [transition('31', 'Done', 'done'), transition('41', "Won't do", 'done'), transition('11', 'Start', 'indeterminate')] } };
  const server = await jira(({ method }) => (method === 'GET' ? two : { status: 204 }));
  const plain = project('ask', server);
  const named = project('ask', server, { 'done-transition': "won't DO" });
  const byId = project('ask', server, { 'done-transition': '31' });
  const wrong = project('ask', server, { 'done-transition': 'Start' });
  try {
    const r = await plain.run('close', '2');
    assert.equal(r.ok, false);
    assert.match(r.error, /several transitions lead to done \(Done \(31\), Won't do \(41\)\); name one as done-transition/);
    assert.deepEqual(server.requests.map((q) => q.method), ['GET'], 'nothing was posted');
    assert.equal((await named.run('close', '2')).message, 'closed PROJ-7 by the "Won\'t do" transition');
    assert.deepEqual(server.requests.at(-1).body, { transition: { id: '41' } });
    assert.equal((await byId.run('close', '2')).message, 'closed PROJ-7 by the "Done" transition');
    assert.match((await wrong.run('close', '2')).error, /configured done transition "Start" is not one of the transitions into done/);
  } finally {
    for (const q of [plain, named, byId, wrong]) q.cleanup();
    await server.close();
  }
});

test('chooseTransition: none into done is refused, one is taken', () => {
  assert.throws(() => chooseTransition([transition('1', 'Start', 'indeterminate')]), /no transition into the done category/);
  assert.throws(() => chooseTransition([]), /no transition into the done category/);
  assert.equal(chooseTransition([transition('1', 'Done', 'done')]).id, '1');
});

test('a dry run sends nothing; off blocks; text with a secret is refused before any request', async () => {
  const server = await jira(() => ({ status: 201, body: { key: 'PROJ-1' } }));
  const ask = project('ask', server);
  const off = project('off', server);
  try {
    const dry = await ask.run('create', '1', { dryRun: true });
    assert.equal(dry.message.split('\n')[0], 'would create an issue in the Jira project PROJ (writes: ask)');
    assert.equal((await ask.run('close', '2', { dryRun: true })).message, 'would close PROJ-7 by its transition into done (writes: ask)');
    assert.equal((await ask.run('comment', '2', { dryRun: true, text: 'hi' })).message.split('\n')[0], 'would comment on PROJ-7 (writes: ask)');
    const blocked = await off.run('comment', '2', { text: 'hi' });
    assert.deepEqual([blocked.ok, blocked.blocked], [false, true]);
    const leaky = await ask.run('create', '3');
    assert.deepEqual([leaky.ok, leaky.blocked], [false, true]);
    assert.match(leaky.error, /contains atlassian/);
    assert.ok(!leaky.error.includes(TOKEN));
    assert.equal(server.requests.length, 0);
    assert.deepEqual(readLog(off.dir).map((l) => [l.event, l.outcome]), [['plan-issue:comment', 'blocked']]);
  } finally {
    ask.cleanup();
    off.cleanup();
    await server.close();
  }
});

test('a Jira failure is reported without the response body or any credential, and recorded as fail', async () => {
  const server = await jira(() => ({ status: 401, body: { errorMessages: [`bad ${TOKEN} for ${EMAIL}`] } }));
  const p = project('ask', server);
  try {
    const r = await p.run('comment', '2', { text: 'hi' });
    assert.equal(r.error, 'Jira refused the credentials (HTTP 401)');
    const log = readFileSync(path.join(p.dir, LOG), 'utf8');
    for (const secret of [TOKEN, EMAIL, 'hi']) assert.ok(!`${r.error}${log}`.includes(secret));
    assert.deepEqual(readLog(p.dir).map((l) => l.outcome), ['fail']);
    const bad = await jira(() => ({ status: 400, body: { errors: { description: 'private words' } } }));
    const q = project('ask', bad);
    try {
      assert.equal((await q.run('create', '1')).error, 'Jira rejected the request (HTTP 400)');
    } finally {
      q.cleanup();
      await bad.close();
    }
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('create answers with no usable key: the step is not updated', async () => {
  const server = await jira(() => ({ status: 201, body: { key: 'OTHER-5' } }));
  const p = project('ask', server);
  try {
    const r = await p.run('create', '1');
    assert.match(r.error, /no usable issue key, so the step was not updated/);
    assert.equal(readFileSync(p.file, 'utf8'), PLAN);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('with the tracker answer github, create still goes to GitHub, not Jira', async () => {
  const server = await jira(() => ({ status: 201, body: { key: 'PROJ-1' } }));
  const p = project('ask', server, {}, 'github');
  try {
    const r = await p.run('create', '1', { dryRun: true });
    assert.match(r.error ?? '', /no GitHub origin/);
    assert.equal(server.requests.length, 0);
  } finally {
    p.cleanup();
    await server.close();
  }
});
