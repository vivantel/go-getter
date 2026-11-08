// H13: a grant the user types in the chat ("merge PRs from now on") is honoured for the session, and the gate still checks the
// shape's preconditions at each use. The model that reads the message is a test double that answers from a table; how well the
// real model reads messages is measured by `go-getter eval grants`, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool, evaluatePostTool, evaluateUserPrompt } from '../src/hook.mjs';
import { installGh } from './support/gh-stub.mjs';

const green = [{ name: 'test', bucket: 'pass' }];
const pr = (n, over = {}) => ({ number: n, state: 'OPEN', isDraft: false, baseRefName: 'main', title: `feat: ${n}`, body: '', checks: green, ...over });
const ATTENDED = { CLAUDE_CODE_SESSION_ATTENDED: '1' };

// What the real model is asked, answered from a table keyed by the user's message.
const ANSWERS = {
  'merge PRs from now on': { action: 'grant', shapes: ['pr-merge'], scope: 'session' },
  'you can merge and push to branches': { action: 'grant', shapes: ['pr-merge', 'git-push'], scope: 'session' },
  'stop merging': { action: 'revoke', shapes: ['pr-merge'] },
  'should you merge this?': { action: 'other' },
};
const model = { run: (cmd, args, { input }) => ({ code: 0, out: JSON.stringify(ANSWERS[/## The developer's message\s+([\s\S]*?)\s*$/.exec(input)?.[1]] ?? { action: 'other' }), err: '' }) };

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-grant-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/guardrails/gated.md'), `---\nid: gated\ntitle: gated\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "gated"\n      run: "builtin:gate-command classes=irreversible,outward free=\\"\\" grantable=\\"git-push,pr-create,pr-merge,pr-close\\""\n---\n\n## Guardrail\n\nAsk.\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  installGh(base, { defaultBranch: 'main', currentPr: 2, prs: [pr(2), pr(9, { checks: [{ name: 'test', bucket: 'fail' }] })] });
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${base}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    say: (prompt, session = 's1', env = ATTENDED) => evaluateUserPrompt(dir, { prompt, session_id: session }, 'claude-code', env, model),
    ask: (command, { session = 's1', host = 'claude-code' } = {}) => evaluatePreTool(dir, { tool_name: 'Bash', session_id: session, tool_input: { command } }, host),
    ran: (command, session = 's1') => evaluatePostTool(dir, { tool_name: 'Bash', session_id: session, tool_input: { command }, tool_response: 'ok' }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const quiet = (d) => !d.deny && !d.ask;

test('before any grant a merge is stopped, and the stop names the phrase that grants it', () => {
  const s = setup();
  try {
    const r = s.ask('gh pr merge 2', { host: 'codex' });
    assert.equal(r.deny, true);
    assert.match(r.reason, /from now on/, r.reason);
  } finally {
    s.cleanup();
  }
});

test('"merge PRs from now on" lets a merge through for that session while the checks hold, and asks with the real reason when they do not', async () => {
  const s = setup();
  try {
    await s.say('merge PRs from now on');
    assert.ok(quiet(s.ask('gh pr merge 2 --squash')), 'granted, checks green');
    const red = s.ask('gh pr merge 9');
    assert.equal(red.ask, true, 'red checks still ask');
    assert.match(red.reason, /checks|CI/i, red.reason);
    assert.ok(quiet(s.ask('gh pr merge 2 --squash', { host: 'codex' })), 'a host that cannot ask uses the same grant');
  } finally {
    s.cleanup();
  }
});

test('a grant belongs to the session that was given it', async () => {
  const s = setup();
  try {
    await s.say('merge PRs from now on', 's1');
    assert.ok(quiet(s.ask('gh pr merge 2', { session: 's1' })));
    assert.equal(quiet(s.ask('gh pr merge 2', { session: 's2' })), false, 'another session');
  } finally {
    s.cleanup();
  }
});

test('"stop merging" revokes it; a question or an unattended prompt grants nothing', async () => {
  const s = setup();
  try {
    await s.say('should you merge this?');
    assert.equal(quiet(s.ask('gh pr merge 2')), false, 'a question');
    await s.say('merge PRs from now on', 's1', {});
    assert.equal(quiet(s.ask('gh pr merge 2')), false, 'a prompt the host started itself');
    await s.say('merge PRs from now on');
    assert.ok(quiet(s.ask('gh pr merge 2')));
    await s.say('stop merging');
    assert.equal(quiet(s.ask('gh pr merge 2')), false, 'revoked');
  } finally {
    s.cleanup();
  }
});

test('a grant never widens past the shape: a force push, a branch delete and a tag push stay stopped', async () => {
  const s = setup();
  try {
    await s.say('you can merge and push to branches');
    // codex has no native ask rules, so the hook alone decides (on Claude Code the host's own rules stop these; evals/grants.mjs models both)
    const host = 'codex';
    assert.ok(quiet(s.ask('git push origin feature', { host })), 'the granted shape');
    for (const command of ['git push --force origin main', 'git push origin --delete feature', 'git push origin v1.0.0', 'git push --tags', 'git push origin refs/tags/v1.0.0']) assert.equal(quiet(s.ask(command, { host })), false, command);
  } finally {
    s.cleanup();
  }
});

test('every merge in a compound command is judged on its own: one green merge does not free a red one', async () => {
  const s = setup();
  try {
    await s.say('merge PRs from now on');
    for (const command of ['gh pr merge 2 && gh pr merge 9', 'gh pr merge 9 && gh pr merge 2', 'gh pr merge 2; gh pr merge 9', 'gh pr merge 2 || gh pr merge 9']) {
      const r = s.ask(command);
      assert.equal(r.ask, true, command);
      assert.match(r.reason, /checks|CI/i, command);
    }
    assert.ok(quiet(s.ask('gh pr merge 2 && gh pr merge 2')), 'two green merges');
  } finally {
    s.cleanup();
  }
});
