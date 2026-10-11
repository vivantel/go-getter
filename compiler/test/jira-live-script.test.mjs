import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'jira-live-check.mjs');
const EMAIL = 'dev@example.test';
const TOKEN = `ATATT3xFfGF0${'a1B2c3D4e5'.repeat(5)}`;
const issue = (summary, category) => ({ fields: { summary, status: { name: 'Anything', statusCategory: { key: category } } } });

// A tiny Jira: KAN-1 open, KAN-2 in progress, SAM1-1 open, anything else missing; create/comment/transition work.
async function jira({ failCreate = false } = {}) {
  const issues = new Map([['KAN-1', issue('One', 'new')], ['KAN-2', issue('Two', 'indeterminate')], ['SAM1-1', issue('Auth', 'new')]]);
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url}`);
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      if (req.headers.authorization !== `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`) return send(401, {});
      const key = /\/issue\/([^/?]+)/.exec(req.url)?.[1];
      if (req.method === 'POST' && req.url === '/rest/api/2/issue') {
        if (failCreate) return send(400, {});
        issues.set('KAN-50', issue(JSON.parse(raw).fields.summary, 'new'));
        return send(201, { key: 'KAN-50' });
      }
      if (req.method === 'POST' && req.url.endsWith('/comment')) return send(201, { id: '1' });
      if (req.url.endsWith('/transitions') && req.method === 'GET') return send(200, { transitions: [{ id: '31', name: 'Done', to: { statusCategory: { key: 'done' } } }] });
      if (req.url.endsWith('/transitions') && req.method === 'POST') {
        issues.set(key, issue(issues.get(key).fields.summary, 'done'));
        return send(204);
      }
      return issues.has(key) ? send(200, issues.get(key)) : send(404, {});
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((resolve) => server.close(resolve)) };
}

const exec = (server, args, env = {}) =>
  run(process.execPath, [script, ...args], { env: { ...process.env, GG_JIRA_LIVE_SITE: server.url, JIRA_EMAIL: EMAIL, CLOUD_JIRA_KEY: TOKEN, ...env } }).then(
    (r) => ({ code: 0, ...r }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

test('the read check reads the real issues, tells a missing one from a failure, and prints no credential', async () => {
  const server = await jira();
  try {
    const r = await exec(server, []);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /KAN-1: issue=open stale=false error=- title="One" step=pending/);
    assert.match(r.stdout, /KAN-2: issue=in progress .* step=in progress/);
    assert.match(r.stdout, /KAN-99999: issue=unknown stale=false error=the issue was not found/);
    assert.match(r.stdout, /read check: 3 of 3 real issues read/);
    assert.match(r.stdout, /jira live check: ok \(read\)/);
    assert.ok(!server.calls.some((c) => c.startsWith('POST')), 'the read check writes nothing');
    for (const secret of [TOKEN, EMAIL]) assert.ok(!(r.stdout + r.stderr).includes(secret));
  } finally {
    await server.close();
  }
});

test('the write check creates, comments, closes and reads the issue back as done', async () => {
  const server = await jira();
  try {
    const r = await exec(server, ['write']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /create: created KAN-50 in Jira; Issue: KAN-50 written to step 1/);
    assert.match(r.stdout, /comment: commented on KAN-50/);
    assert.match(r.stdout, /close: closed KAN-50 by the "Done" transition/);
    assert.match(r.stdout, /KAN-50: issue=done .* title="go-getter write check \(safe to delete\)"/);
    assert.match(r.stdout, /jira live check: ok \(read and write\)/);
    assert.deepEqual(server.calls.filter((c) => c.startsWith('POST')), ['POST /rest/api/2/issue', 'POST /rest/api/2/issue/KAN-50/comment', 'POST /rest/api/2/issue/KAN-50/transitions']);
    for (const secret of [TOKEN, EMAIL]) assert.ok(!(r.stdout + r.stderr).includes(secret));
  } finally {
    await server.close();
  }
});

test('a failure stops the chain with a clear message and a non-zero exit', async () => {
  const bad = await jira({ failCreate: true });
  try {
    const r = await exec(bad, ['write']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /create: FAILED: Jira rejected the request \(HTTP 400\)/);
    assert.ok(!/comment:|close:/.test(r.stdout), 'nothing runs after a failed create');
    assert.match(r.stdout, /jira live check: FAILED/);
  } finally {
    await bad.close();
  }
  const server = await jira();
  try {
    const wrong = await exec(server, [], { CLOUD_JIRA_KEY: 'not-the-token' });
    assert.equal(wrong.code, 1);
    assert.match(wrong.stdout, /Jira refused the credentials \(HTTP 401\)/);
    assert.ok(!wrong.stdout.includes('not-the-token'));
    const noVar = await exec(server, [], { CLOUD_JIRA_KEY: '' });
    assert.match(noVar.stdout, /the environment variable CLOUD_JIRA_KEY is not set/);
  } finally {
    await server.close();
  }
});

test('usage errors exit 2', async () => {
  const server = await jira();
  try {
    assert.equal((await exec(server, ['delete'])).code, 2);
    assert.equal((await exec(server, ['write', 'extra'])).code, 2);
  } finally {
    await server.close();
  }
});
