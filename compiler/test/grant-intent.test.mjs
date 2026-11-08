import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseGrantAnswer, interpretGrant } from '../src/grant-intent.mjs';
import { addSessionGrant, sessionGranted, revokeSessionGrant, SESSION_GRANT_TTL_MS } from '../src/secrets/approvals.mjs';

const ALLOWED = ['pr-merge', 'git-push'];

test('only a closed answer with allowed shape ids grants anything', () => {
  const ok = (o) => parseGrantAnswer(JSON.stringify(o), ALLOWED);
  assert.deepEqual(ok({ action: 'grant', shapes: ['pr-merge'], scope: 'session' }), { action: 'grant', shapes: ['pr-merge'] });
  assert.deepEqual(ok({ action: 'grant', shapes: ['pr-merge', 'release', 'git-push-force'] }), { action: 'grant', shapes: ['pr-merge'] }, 'ids outside the list are dropped');
  assert.equal(ok({ action: 'grant', shapes: ['release'] }).action, 'other', 'nothing allowed left');
  assert.equal(ok({ action: 'grant', shapes: [] }).action, 'other');
  assert.equal(ok({ action: 'grant', shapes: ['pr-merge'], scope: 'forever' }).action, 'other', 'only session scope');
  assert.equal(ok({ action: 'other' }).action, 'other');
  assert.deepEqual(ok({ action: 'revoke', shapes: [] }), { action: 'revoke', shapes: [] });
  for (const out of ['', 'sure, merging is fine', '{"action":"grant"', 'null']) assert.equal(parseGrantAnswer(out, ALLOWED).action, 'other', out);
});

test('the model is asked with the allowed ids and the message, and a failed call grants nothing', () => {
  const seen = [];
  const run = (cmd, args, { input }) => (seen.push(input), { code: 1, out: '', err: '' });
  const r = interpretGrant({ project: process.cwd(), message: 'merge PRs from now on', shapes: ALLOWED, run });
  assert.equal(r.action, 'other');
  assert.match(seen[0], /pr-merge \(merge pull requests\)/);
  assert.match(seen[0], /## The developer's message\s+merge PRs from now on/);
});

test('a session grant is per project and session, lapses after a day, and is withdrawn by id', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-sg-')));
  const env = { GO_GETTER_HOME: path.join(base, 'home') };
  const project = path.join(base, 'p');
  mkdirSync(project);
  const t0 = new Date('2026-11-08T10:00:00Z');
  try {
    addSessionGrant(project, 's1', ['pr-merge', 'git-push'], { env, now: () => t0 });
    assert.equal(sessionGranted(project, 's1', 'pr-merge', { env, now: () => t0 }), true);
    assert.equal(sessionGranted(project, 's2', 'pr-merge', { env, now: () => t0 }), false, 'another session');
    assert.equal(sessionGranted(project, 's1', 'pr-close', { env, now: () => t0 }), false, 'another shape');
    assert.equal(sessionGranted(project, undefined, 'pr-merge', { env, now: () => t0 }), false, 'no session');
    assert.equal(sessionGranted(project, 's1', 'pr-merge', { env, now: () => new Date(t0.getTime() + SESSION_GRANT_TTL_MS + 1) }), false, 'lapsed');
    assert.equal(revokeSessionGrant(project, 's1', ['pr-merge'], { env, now: () => t0 }), 1);
    assert.equal(sessionGranted(project, 's1', 'git-push', { env, now: () => t0 }), true);
    assert.equal(revokeSessionGrant(project, 's1', [], { env, now: () => t0 }), 1, 'no ids withdraws the rest');
    assert.equal(sessionGranted(project, 's1', 'git-push', { env, now: () => t0 }), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
