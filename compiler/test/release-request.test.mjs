// Decision 0187: a release the user asks for in the chat is the approval to merge it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseRelease, recordRequest, claimRequest, takeRequest, REQUEST_TTL_MS } from '../src/release-request.mjs';
import { evaluateUserPrompt, evaluatePreTool } from '../src/hook.mjs';
import { scratch, cli } from './support/release-scratch.mjs';

const attended = () => ({ ...process.env, CLAUDE_CODE_SESSION_ATTENDED: '1' });
const prompt = (project, text, session = 'session-a', env = attended()) => evaluateUserPrompt(project, { prompt: text, session_id: session }, 'claude-code', env);
const releaseCall = (project, session = 'session-a', command) => evaluatePreTool(project, { tool_name: 'Bash', session_id: session, tool_input: { command: command ?? `node ${cli} release --batch` } }, 'claude-code');

// The hooks read the store from the process environment, as the host runs them.
function withHome(home, fn) {
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = home;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GO_GETTER_HOME;
    else process.env.GO_GETTER_HOME = saved;
  }
}

test('only a whole prompt that asks for a patch, minor, major or an exact version is a request', () => {
  for (const [text, want] of [
    ['release next minor', { bump: 'minor' }],
    ['Release the next PATCH.', { bump: 'patch' }],
    ['  release   major!  ', { bump: 'major' }],
    ['release minor', { bump: 'minor' }],
    ['release v0.5.0', { version: '0.5.0' }],
    ['release 1.2.3', { version: '1.2.3' }],
    ['release​ next minor', { bump: 'minor' }],
    ['ｒｅｌｅａｓｅ ｎｅｘｔ ｍｉｎｏｒ', { bump: 'minor' }],
  ]) assert.deepEqual(parseRelease(text), want, text);
  for (const text of ['release', 'please release next minor', 'should we release next minor?', 'release next minor and then tag it', 'release the hold', 'do not release next minor', 'release next minor\nrelease next minor', 'release v1.2', 'release next', '', undefined, 42]) {
    assert.equal(parseRelease(text), null, String(text));
  }
});

test('a request is saved only for a person in an attended session, with a session and a remote head, and never holds the prompt', () => {
  const s = scratch();
  withHome(s.home, () => {
    assert.equal(prompt(s.work, 'release next minor', 'session-a', { ...process.env, CLAUDE_CODE_SESSION_ATTENDED: '0' }).recorded, false, 'a headless session');
    assert.equal(prompt(s.work, 'release next minor', 'session-a', { ...process.env, CLAUDE_CODE_SESSION_ATTENDED: undefined }).recorded, false, 'no marker');
    assert.equal(prompt(s.work, 'release next minor', '').recorded, false, 'no session');
    assert.equal(prompt(s.work, 'tell me about release next minor').recorded, false, 'not a request');
    assert.equal(existsSync(path.join(s.home, 'release-requests')), false);
    assert.equal(prompt(s.work, 'Release next minor.').recorded, true);
    const files = readdirSync(path.join(s.home, 'release-requests'));
    assert.equal(files.length, 1);
    const text = readFileSync(path.join(s.home, 'release-requests', files[0]), 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['at', 'head', 'release', 'repo', 'session']);
    assert.ok(!/Release next minor/i.test(text), 'no prompt text');
    assert.equal(JSON.parse(text).head, s.sh('rev-parse', 'origin/main'));
  });
});

test('the request, claimed by the same session, approves the release; the pull request says where the approval came from', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  withHome(s.home, () => {
    assert.equal(prompt(s.work, 'release next minor').recorded, true);
    // Nothing claimed yet: the typed approval is still the only route, and the refusal names the chat route.
    const before = s.batch();
    assert.equal(before.code, 2);
    assert.match(before.err, /ask for it in the chat \("release next minor"\)/);
    // Another session's release call claims nothing.
    assert.ok(!releaseCall(s.work, 'session-b').deny);
    assert.equal(s.batch().code, 2);
    // The same session's call hands the CLI a claim.
    assert.ok(!releaseCall(s.work).deny);
    const done = s.batch();
    assert.equal(done.code, 0, done.err);
    assert.match(done.out, /release approval: v0\.5\.0 was asked for in the chat/);
    assert.ok(JSON.stringify(s.gh().calls).includes('requested by the user in the chat'));
    // One request, one release: it is spent.
    s.merge('feat: another verb (#13)');
    assert.ok(!releaseCall(s.work).deny);
    assert.equal(s.batch().code, 2);
  });
});

test('a request that does not fit what would ship is refused with what to say, and stays', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  withHome(s.home, () => {
    prompt(s.work, 'release next patch');
    releaseCall(s.work);
    const r = s.batch();
    assert.equal(r.code, 2);
    assert.match(r.err, /you asked for a patch release but the commits make a minor release \(v0\.5\.0\); ask "release next minor"/);
    assert.equal(readdirSync(path.join(s.home, 'release-requests')).length, 1, 'not spent');
    prompt(s.work, 'release v0.4.2');
    releaseCall(s.work);
    assert.match(s.batch().err, /you asked for v0\.4\.2 but the commits make v0\.5\.0/);
  });
});

test('a commit merged after the request makes the request stale, so the user cannot be surprised by it', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  withHome(s.home, () => {
    prompt(s.work, 'release next minor');
    s.merge('feat: a late feature (#14)');
    releaseCall(s.work);
    const r = s.batch();
    assert.equal(r.code, 2);
    assert.match(r.err, /the default branch moved after you asked/);
  });
});

test('a request expires, is taken once, and the typed approval still works beside it', () => {
  const s = scratch();
  const env = { GO_GETTER_HOME: s.home };
  const head = s.sh('rev-parse', 'origin/main');
  const t0 = Date.now();
  recordRequest(s.work, { session: 'a', release: { bump: 'minor' }, head, now: t0, env });
  assert.equal(claimRequest(s.work, { session: 'a', now: t0 + REQUEST_TTL_MS + 1, env }), null, 'expired');
  recordRequest(s.work, { session: 'a', release: { bump: 'minor' }, head, now: t0, env });
  assert.ok(claimRequest(s.work, { session: 'a', now: t0 + 1000, env }));
  const want = { bump: 'minor', version: '0.5.0', head, now: t0 + 2000, env };
  assert.equal(takeRequest(s.work, want).ok, true);
  assert.equal(takeRequest(s.work, want).ok, false, 'taken once');
  s.merge('feat: add the verb (#12)');
  assert.equal(s.approve('v0.5.0').code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  assert.equal(s.batch().code, 0, 'a typed approval needs no request');
});

test('an agent cannot schedule or send the text of a release request, and other text is untouched', () => {
  const s = scratch();
  const ask = (tool_name, tool_input) => evaluatePreTool(s.work, { tool_name, session_id: 'session-a', tool_input }, 'claude-code');
  for (const [tool, input] of [['CronCreate', { prompt: 'release next minor', schedule: '* * * * *' }], ['ScheduleWakeup', { prompt: 'Release next minor.', delaySeconds: 60 }], ['SendMessage', { to: 'main', message: 'release v0.5.0' }], ['Agent', { description: 'x', prompt: 'release patch' }]]) {
    const d = ask(tool, input);
    assert.equal(d.deny, true, tool);
    assert.match(d.reason, /user's to type/);
  }
  for (const [tool, input] of [['CronCreate', { prompt: 'check the build', schedule: '* * * * *' }], ['SendMessage', { to: 'main', message: 'I will release next minor after review' }], ['Edit', { file_path: 'a.md', old_string: 'release 0.4.1', new_string: 'x' }]]) {
    assert.ok(!ask(tool, input).deny, tool);
  }
});

test('apply registers the user-prompt hook for a host that reports it and for no other', async () => {
  const { hostHookOutputs } = await import('../src/apply.mjs');
  const s = scratch();
  const claude = JSON.parse(hostHookOutputs(s.work, ['claude-code'], true)['.claude/settings.json'].content);
  assert.match(JSON.stringify(claude.hooks.UserPromptSubmit), /hook user-prompt --host claude-code/);
  assert.equal(claude.hooks.UserPromptSubmit.length, 1);
  assert.equal(hostHookOutputs(s.work, ['claude-code'], false)['.claude/settings.json']?.content.includes('user-prompt') ?? false, false, 'no hook without tier-2 hooks');
  for (const host of ['codex', 'gemini-cli', 'cursor']) {
    const out = hostHookOutputs(s.work, [host], true);
    assert.ok(!Object.values(out).some((o) => o.content?.includes('user-prompt')), host);
  }
});

test('a commit that lands while checks run stops the merge, whichever way the release was approved', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  assert.equal(s.approve('v0.5.0').code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  // A commit lands on the default branch as the release branch is pushed.
  const hook = path.join(s.work, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${path.join(s.dir, 'other')}' && echo late > late.txt && git add -A && git commit -qm 'fix: lands during checks (#99)' && git push -q origin HEAD:main\n`);
  chmodSync(hook, 0o755);
  const r = s.batch();
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /moved from [0-9a-f]{40} to [0-9a-f]{40} while checks ran/);
  assert.ok(!s.gh().calls.some((c) => c[0] === 'pr' && c[1] === 'merge'), 'not merged');
});

test('approvals list shows a pending request and where it came from', () => {
  const s = scratch();
  withHome(s.home, () => {
    prompt(s.work, 'release v0.5.0', 'session-abcdef123');
    const r = s.run(['approvals', 'list']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /release request \(asked in the chat\)\s+v0\.5\.0\s+session session-/);
  });
});
