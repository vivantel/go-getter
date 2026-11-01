// The redirect hook (roadmap T4, decision 0157): a raw push, pull request or merge that `go-getter ship` covers is denied with the verb named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluatePreTool, redirectVerbs } from '../src/hook.mjs';
import { suggestedCommands, allowSuggestions } from '../src/allow-rules.mjs';

const VERBS = 'git-push=go-getter ship,pr-create=go-getter ship,pr-merge=go-getter ship';
const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-11-01\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: c\n      run: ${run}\n---\n\n## Guardrail\n\nx\n`;

function project({ redirect = `builtin:redirect-to-verb verbs="${VERBS}"`, gate = 'builtin:gate-command classes=irreversible,outward' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-redirect-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  if (redirect) writeFileSync(path.join(dir, 'docs/guardrails/raw-commands-redirect-to-verbs.md'), guardrail('raw-commands-redirect-to-verbs', redirect));
  if (gate) writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', gate));
  return dir;
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const withProject = (opts, fn) => {
  const dir = project(opts);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('each raw command the verb covers is denied, naming the verb and the human escape', () => {
  withProject({}, (dir) => {
    for (const command of ['git push', 'git push -u origin HEAD', 'git -C app push origin main', 'gh pr create --fill', 'gh pr merge 5 --squash', 'git status && git push']) {
      const d = evaluatePreTool(dir, bash(command), 'claude-code');
      assert.equal(d.deny, true, command);
      assert.match(d.reason, /`go-getter ship`/, command);
      assert.match(d.reason, /raw-commands-redirect-to-verbs/);
      assert.match(d.reason, /! <command>/);
    }
  });
});

test('the redirect wins over the gate: no prompt or hand-over for a covered command', () => {
  withProject({}, (dir) => {
    const d = evaluatePreTool(dir, bash('gh pr merge 5'), 'claude-code');
    assert.match(d.reason, /go-getter ship/);
    assert.doesNotMatch(d.reason, /needs a human/);
  });
});

test('the verb itself and unrelated commands are not redirected', () => {
  withProject({ gate: null }, (dir) => {
    for (const command of ['go-getter ship --why "x"', 'node compiler/bin/go-getter.mjs ship --dry-run --why x', 'git status', 'git pull', 'git commit -m x', 'gh pr view 5', 'gh pr checks 5', 'echo "git push"', 'npm test']) {
      assert.deepEqual(evaluatePreTool(dir, bash(command), 'claude-code'), { deny: false }, command);
    }
  });
});

test('a destructive form is left to the gate, not sent to ship', () => {
  withProject({}, (dir) => {
    for (const command of ['git push --force', 'git push -f origin main', 'git push origin +main', 'git push --delete origin old']) {
      const d = evaluatePreTool(dir, bash(command), 'claude-code');
      assert.doesNotMatch(d.reason ?? '', /go-getter ship/, command);
    }
  });
});

test('every host format is redirected, and a project without the guardrail is not', () => {
  withProject({}, (dir) => {
    const shapes = {
      cursor: { tool_name: 'Shell', tool_input: { command: 'git push' } },
      'gemini-cli': { tool_name: 'run_shell_command', tool_input: { command: 'git push' } },
      copilot: { toolName: 'bash', toolArgs: JSON.stringify({ command: 'git push' }) },
      opencode: { tool_name: 'bash', tool_input: { command: 'git push' } },
    };
    for (const [host, payload] of Object.entries(shapes)) assert.match(evaluatePreTool(dir, payload, host).reason, /go-getter ship/, host);
  });
  withProject({ redirect: null, gate: null }, (dir) => assert.deepEqual(evaluatePreTool(dir, bash('git push'), 'claude-code'), { deny: false }));
});

test('only the commands the guardrail lists are redirected', () => {
  withProject({ redirect: 'builtin:redirect-to-verb verbs="pr-merge=go-getter ship"', gate: null }, (dir) => {
    assert.equal(evaluatePreTool(dir, bash('gh pr merge 5'), 'claude-code').deny, true);
    assert.deepEqual(evaluatePreTool(dir, bash('git push'), 'claude-code'), { deny: false });
  });
  assert.equal(redirectVerbs({}).size, 0);
  assert.deepEqual([...redirectVerbs({ verbs: ' a = b ,, c=d ' })], [['a', 'b'], ['c', 'd']]);
});

test('doctor lists the verb as an allow rule so the redirect does not just move the stop', () => {
  withProject({ gate: null }, (dir) => {
    const cmds = suggestedCommands(dir);
    const ship = cmds.find((c) => c.command.endsWith(' ship') || c.command === 'ship');
    assert.ok(ship, JSON.stringify(cmds));
    assert.match(ship.why, /git-push, pr-create, pr-merge/);
    const rules = allowSuggestions(dir, ['claude-code']);
    assert.ok(rules[0].rules.some((r) => /ship:\*\)$/.test(r)), JSON.stringify(rules));
  });
});
