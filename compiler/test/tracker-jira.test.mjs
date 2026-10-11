import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { jiraSource, checkConfig, jiraConfig } from '../src/trackers/jira.mjs';
import { callSource } from '../src/trackers/worksource.mjs';
import { STATE_DIR } from '../src/telemetry/record.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { runWorkSourceContract } from './support/worksource-contract.mjs';

const run = promisify(execFile);
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const MARK = { pending: ' ', 'in progress': '~', done: 'x', blocked: '!', moved: '>' };
const TOKEN = `ATATT3xFfGF0${'a1B2c3D4e5'.repeat(5)}`;
const EMAIL = 'dev@example.test';
const ENV = { GG_TEST_EMAIL: EMAIL, GG_TEST_TOKEN: TOKEN };
const BASIC = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;
const issue = (summary, category, statusName = 'Whatever') => ({ fields: { summary, status: { name: statusName, statusCategory: { key: category } } } });

// A local HTTP server standing in for Jira: `routes` maps an issue key to { status, body } (404 when absent).
async function jira(routes) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    const key = decodeURIComponent(/\/issue\/([^?]+)/.exec(req.url)?.[1] ?? '');
    const route = typeof routes === 'function' ? routes(key, req, res) : routes[key];
    if (route === 'handled') return;
    res.writeHead(route?.status ?? 404, { 'Content-Type': 'application/json', ...(route?.headers ?? {}) });
    res.end(JSON.stringify(route?.body ?? { errorMessages: ['not found'] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)), server };
}

// A project whose plan has steps `[id, title, state, issue?, needs?]`.
function project(steps) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-jira-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: cleanGitEnv(process.env) });
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  const file = path.join(dir, 'docs/plans/p.md');
  const body = steps.map(([id, title, state, key, needs]) => `### ${id} ${title} — [${MARK[state]}]\n${key ? `Issue: ${key}\n` : ''}Needs: ${needs ?? 'none'}\nDone-when: ${title}.\n`);
  writeFileSync(file, `# Plan\n\n${body.join('\n')}`);
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const NOW = () => new Date('2026-10-11T12:00:00Z');
const source = (p, site, extra = {}) => jiraSource(p.file, { project: p.dir, name: 'docs/plans/p.md', now: NOW, config: { site, 'email-env': 'GG_TEST_EMAIL', 'token-env': 'GG_TEST_TOKEN' }, env: ENV, ...extra });
const list = async (s) => (await callSource(s, 'list')).result.steps;

// The shared contract on a plan with no issues: nothing is fetched.
runWorkSourceContract('jira source (no issues)', (seed) => {
  const p = project(seed.map((s) => [s.id, s.title, s.state, undefined, s.needs.length ? s.needs.join(', ') : undefined]));
  return { source: source(p, 'https://jira.invalid'), cleanup: p.cleanup };
});

test('a status named anything maps by its category, and the request carries the credentials', async () => {
  const server = await jira({
    'PROJ-1': { status: 200, body: issue('Backlog item', 'new', 'Backlog') },
    'PROJ-2': { status: 200, body: issue('Being built', 'indeterminate', 'Ready for QA') },
    'PROJ-3': { status: 200, body: issue('Shipped', 'done', "Won't Fix") },
  });
  const p = project([['1', 'One', 'pending', 'PROJ-1'], ['2', 'Two', 'pending', 'PROJ-2'], ['3', 'Three', 'pending', 'https://acme.atlassian.net/browse/PROJ-3']]);
  try {
    const [one, two, three] = await list(source(p, server.url));
    assert.deepEqual([one.issueState.state, one.state], ['open', 'pending']);
    assert.deepEqual([two.issueState.state, two.state, two.fileState, two.mismatch], ['in progress', 'in progress', 'pending', undefined]);
    assert.deepEqual([three.issueState.state, three.state, three.mismatch], ['done', 'done', 'the issue is closed but the plan marks the step pending']);
    assert.deepEqual(one.issueState, { tracker: 'jira', ref: 'jira:PROJ-1', state: 'open', title: 'Backlog item', fetchedAt: '2026-10-11T12:00:00.000Z', stale: false });
    assert.equal(server.requests.length, 3);
    for (const r of server.requests) assert.equal(r.authorization, BASIC);
    assert.deepEqual(server.requests.map((r) => r.url).sort(), ['/rest/api/2/issue/PROJ-1?fields=summary,status', '/rest/api/2/issue/PROJ-2?fields=summary,status', '/rest/api/2/issue/PROJ-3?fields=summary,status']);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('an open issue cannot be done; an in-progress issue is not a mismatch for a pending step', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue('a', 'new') }, 'PROJ-2': { status: 200, body: issue('b', 'indeterminate') } });
  const p = project([['1', 'One', 'done', 'PROJ-1'], ['2', 'Two', 'done', 'PROJ-2']]);
  try {
    const [one, two] = await list(source(p, server.url));
    assert.deepEqual([one.state, one.mismatch], ['in progress', 'the plan marks the step done but its issue is open']);
    assert.deepEqual([two.state, two.mismatch], ['in progress', 'the plan marks the step done but its issue is not']);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('a missing variable is named, nothing is requested, and no value appears', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue('a', 'done') } });
  const p = project([['1', 'One', 'pending', 'PROJ-1']]);
  try {
    const [one] = await list(source(p, server.url, { env: { GG_TEST_EMAIL: EMAIL } }));
    assert.deepEqual([one.state, one.issueState.state, one.issueState.stale, one.issueState.error], ['pending', 'unknown', true, 'the environment variable GG_TEST_TOKEN is not set']);
    assert.equal(server.requests.length, 0);
    assert.ok(!JSON.stringify(one).includes(EMAIL));
    const two = await list(source(p, server.url, { env: { GG_TEST_TOKEN: TOKEN } }));
    assert.equal(two[0].issueState.error, 'the environment variable GG_TEST_EMAIL is not set');
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('the token never reaches a step, an error or the cache', async () => {
  let refuse = false;
  const server = await jira(() => (refuse ? { status: 401, body: { errorMessages: [`bad token ${TOKEN}`] } } : { status: 200, body: issue('ok', 'done') }));
  const p = project([['1', 'One', 'pending', 'PROJ-1'], ['2', 'Two', 'pending', 'PROJ-2']]);
  try {
    await list(source(p, server.url)); // fills the cache
    refuse = true;
    const steps = await list(source(p, server.url));
    assert.equal(steps[1].issueState.error, 'Jira refused the credentials (HTTP 401)');
    assert.equal(steps[1].issueState.stale, true);
    const everything = `${JSON.stringify(steps)}${readFileSync(path.join(p.dir, STATE_DIR, 'tracker-cache.json'), 'utf8')}`;
    for (const secret of [TOKEN, EMAIL, BASIC.slice(6)]) assert.ok(!everything.includes(secret));
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('one issue that cannot be read leaves only its step stale', async () => {
  const server = await jira((issueKey) => (issueKey === 'PROJ-2' ? { status: 500, body: {} } : { status: 200, body: issue('fine', 'done') }));
  const p = project([['1', 'One', 'pending', 'PROJ-1'], ['2', 'Two', 'pending', 'PROJ-2']]);
  try {
    const [one, two] = await list(source(p, server.url));
    assert.deepEqual([one.state, one.issueState.stale], ['done', false]);
    assert.deepEqual([two.state, two.issueState.state, two.issueState.stale], ['pending', 'unknown', true]);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('a missing issue is unknown, not stale; refused credentials and a down server are stale, with the last state read when there is one', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue('One', 'done') } });
  const p = project([['1', 'One', 'pending', 'PROJ-1'], ['2', 'Two', 'pending', 'PROJ-9']]);
  try {
    const [one, two] = await list(source(p, server.url));
    assert.deepEqual([two.issueState.state, two.issueState.stale, two.issueState.error], ['unknown', false, 'the issue was not found']);
    assert.equal(one.state, 'done');
    await server.close();
    const [downOne, downTwo] = await list(source(p, server.url));
    assert.deepEqual([downOne.state, downOne.issueState.stale, downOne.issueState.fetchedAt, downOne.issueState.error], ['done', true, '2026-10-11T12:00:00.000Z', undefined], 'a network error is not shown, only the stale label');
    assert.deepEqual([downTwo.state, downTwo.issueState.state, downTwo.issueState.stale], ['pending', 'unknown', true]);
  } finally {
    p.cleanup();
  }
});

test('a redirect is not followed, so the credentials stay on the configured site', async () => {
  const other = await jira({ 'PROJ-1': { status: 200, body: issue('elsewhere', 'done') } });
  const server = await jira(() => ({ status: 302, headers: { Location: `${other.url}/rest/api/2/issue/PROJ-1` }, body: {} }));
  const p = project([['1', 'One', 'pending', 'PROJ-1']]);
  try {
    const [one] = await list(source(p, server.url));
    assert.deepEqual([one.state, one.issueState.state, one.issueState.stale], ['pending', 'unknown', true]);
    assert.equal(other.requests.length, 0);
  } finally {
    p.cleanup();
    await server.close();
    await other.close();
  }
});

test('an issue title is cleaned: an Atlassian token in it is redacted', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue(`rotate ${TOKEN}\nnow`, 'new') } });
  const p = project([['1', 'One', 'pending', 'PROJ-1']]);
  try {
    const [one] = await list(source(p, server.url));
    assert.equal(one.issueState.title, 'rotate [redacted] now');
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('bearer auth sends the token alone', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue('a', 'new') } });
  const p = project([['1', 'One', 'pending', 'PROJ-1']]);
  try {
    await list(source(p, server.url, { config: { site: server.url, auth: 'bearer', 'token-env': 'GG_TEST_TOKEN' }, env: { GG_TEST_TOKEN: TOKEN } }));
    assert.equal(server.requests[0].authorization, `Bearer ${TOKEN}`);
  } finally {
    p.cleanup();
    await server.close();
  }
});

test('the configuration is checked: an https site, plain URL, valid variable names', () => {
  const ok = { site: 'https://acme.atlassian.net', 'email-env': 'A', 'token-env': 'B' };
  assert.equal(checkConfig(ok, { A: 'e', B: 't' }).base, 'https://acme.atlassian.net');
  assert.equal(checkConfig({ ...ok, site: 'https://jira.example.com/jira/' }, { A: 'e', B: 't' }).base, 'https://jira.example.com/jira');
  assert.throws(() => checkConfig(null), /Jira is not configured/);
  assert.throws(() => checkConfig({ ...ok, site: 'http://jira.example.com' }, { A: 'e', B: 't' }), /must be an https URL/);
  assert.throws(() => checkConfig({ ...ok, site: 'https://user:pw@acme.atlassian.net' }, { A: 'e', B: 't' }), /plain URL/);
  assert.throws(() => checkConfig({ ...ok, site: 'nope' }, { A: 'e', B: 't' }), /not a URL/);
  assert.throws(() => checkConfig({ ...ok, 'token-env': 'has space' }, { A: 'e' }), /not an environment variable name/);
  assert.equal(checkConfig({ site: 'http://localhost:8080' }, { JIRA_EMAIL: 'e', JIRA_API_TOKEN: 't' }).base, 'http://localhost:8080', 'defaults name JIRA_EMAIL and JIRA_API_TOKEN');
});

test('plan status reads the Jira issue named by the adopted tracker decision', async () => {
  const server = await jira({ 'PROJ-1': { status: 200, body: issue('Shipped', 'done') } });
  const p = project([['1', 'One', 'pending', 'PROJ-1']]);
  try {
    writeFileSync(path.join(p.dir, 'docs/decisions/0001-tracker-jira.md'), `---\nid: 0001-tracker-jira\ntitle: Jira\nstatus: active\ndate: 2026-10-11\ntags: [x]\ngo-getter:\n  tracker-jira:\n    site: ${server.url}\n    email-env: GG_TEST_EMAIL\n    token-env: GG_TEST_TOKEN\n---\n\nx\n`);
    assert.equal(jiraConfig(p.dir).site, server.url);
    const { stdout } = await run(process.execPath, [cli, 'plan', 'status', 'docs/plans/p.md'], { cwd: p.dir, env: { ...process.env, ...ENV } });
    assert.match(stdout, /\[x\]|1\/1 done/);
    assert.match(stdout, /mismatch: the issue is closed but the plan marks the step pending/);
    assert.match(stdout, /1 One PROJ-1/);
  } finally {
    p.cleanup();
    await server.close();
  }
});
