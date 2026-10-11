// Approve-once for outward command shapes with preconditions checked at each use (decision 0130, step 2 of the autonomous-run
// plan): a run or a remembered approval lets a grantable shape go ahead without a prompt while its preconditions hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool, evaluatePostTool } from '../src/hook.mjs';
import { startRun, endRun } from '../src/runs/record.mjs';
import { addShape, shapeApproved, listShapes, revokeShape } from '../src/secrets/approvals.mjs';
import { gateEntries, nativeRules, APPROVABLE } from '../src/gate.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { mergeTarget } from '../src/runs/preconditions.mjs';
import { installGh } from './support/gh-stub.mjs';

const GRANTABLE = 'git-push,pr-create,pr-merge,pr-close';
const PLAN = `# P — plan

**Status legend**: x

### 1 First — [ ]
Issue: #101
Class: implement · Effort: low · Needs: none · Check: \`true\`
Do: a.
Done-when: a.

### 2 Second — [ ]
Issue: #102
Class: implement · Effort: low · Needs: 1 · Check: \`true\`
Do: b.
Done-when: b.

### 3 Third — [ ]
Issue: #103
Class: implement · Effort: low · Needs: 2 · Check: \`true\`
Do: c.
Done-when: c.
`;
const green = [{ name: 'test', bucket: 'pass' }, { name: 'golden', bucket: 'pass' }];
const pr = (n, over = {}) => ({ number: n, state: 'OPEN', isDraft: false, baseRefName: 'main', title: `feat: step ${n}`, body: `Refs: #${100 + n}`, checks: green, ...over });

function setup({ grantable = GRANTABLE } = {}) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-outward-')));
  const dir = path.join(base, 'proj');
  for (const rel of ['docs/guardrails', 'docs/plans']) mkdirSync(path.join(dir, rel), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN);
  writeFileSync(path.join(dir, 'docs/guardrails/gated.md'), `---\nid: gated\ntitle: gated\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "gated"\n      run: "builtin:gate-command classes=irreversible,outward free=\\"\\" grantable=\\"${grantable}\\""\n---\n\n## Guardrail\n\nAsk.\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const gh = installGh(base, { defaultBranch: 'main', currentPr: 2, prs: [pr(1), pr(2), pr(3), pr(7, { body: 'unrelated', title: 'chore: other' }), pr(8, { baseRefName: 'release' }), pr(9, { checks: [{ name: 'test', bucket: 'fail' }, { name: 'golden', bucket: 'pass' }] }), pr(10, { checks: [{ name: 'test', bucket: 'pending' }] })] });
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${base}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  return {
    base, dir, gh,
    ask: (command, host = 'claude-code') => evaluatePreTool(dir, bash(command), host),
    ran: (command) => evaluatePostTool(dir, { ...bash(command), tool_response: 'ok' }),
    run: (grants = ['pr-merge', 'pr-create', 'git-push'], steps = ['1', '2', '3']) => startRun(dir, { plan: 'docs/plans/p.md', steps, grants }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const quiet = (d) => !d.deny && !d.ask;

test('a run lets a merge through with green checks, the default branch as base and a pull request of its range', () => {
  const s = setup();
  try {
    s.run(['pr-merge'], ['1', '2']);
    assert.ok(quiet(s.ask('gh pr merge 2 --squash --delete-branch')), 'claude-code');
    assert.ok(quiet(s.ask('gh pr merge 1')), 'a bare number');
    assert.ok(quiet(s.ask('gh pr merge --squash')), 'no number: the current branch\'s pull request (#2)');
    assert.ok(quiet(s.ask('gh pr merge 2', 'codex')), 'a host that cannot ask uses the run record only');
  } finally {
    s.cleanup();
  }
});

test('a merge is refused for a red or pending pull request, one outside the range, a draft-less other base, and after the run ended', () => {
  const s = setup();
  try {
    s.run(['pr-merge'], ['1', '2']);
    const cases = [
      ['gh pr merge 9', /checks are not green on pull request #9: test \(fail\)/],
      ['gh pr merge 10', /test \(pending\)/],
      ['gh pr merge 3', /names no issue of a step in the run's range \(#101, #102\)/],
      ['gh pr merge 7', /names no issue of a step in the run's range/],
      ['gh pr merge 8', /targets release, not the default branch main/],
      ['gh pr merge 99', /could not be read/],
    ];
    for (const [command, why] of cases) {
      const d = s.ask(command);
      assert.equal(d.ask, true, command);
      assert.match(d.reason, why, command);
      const blocked = s.ask(command, 'codex');
      assert.equal(blocked.deny, true, `${command} on a host that cannot ask`);
    }
    endRun(s.dir);
    assert.equal(s.ask('gh pr merge 2').ask, true, 'no run, no approval: asks');
    assert.equal(s.ask('gh pr merge 2', 'codex').deny, true);
  } finally {
    s.cleanup();
  }
});

test('the first use asks once, the post-tool hook remembers it, and the next use is silent while its preconditions hold', () => {
  const s = setup();
  try {
    const first = s.ask('gh pr merge 3');
    assert.equal(first.ask, true);
    assert.match(first.reason, /approve "gh pr merge 3"\? Approving remembers pr-merge/);
    assert.equal(shapeApproved(s.dir, 'pr-merge'), false, 'not remembered until the call ran');
    s.ran('gh pr merge 3');
    assert.equal(shapeApproved(s.dir, 'pr-merge'), true);
    assert.ok(quiet(s.ask('gh pr merge 3')), 'silent');
    assert.ok(quiet(s.ask('gh pr merge 1')), 'silent for another pull request: no run, so no range test');
    assert.equal(s.ask('gh pr merge 9').ask, true, 'a red pull request asks again');
    assert.equal(s.ask('gh pr merge 8').ask, true, 'another base asks again');
    assert.equal(s.ask('gh pr create --fill').ask, true, 'another shape is not approved by it');
    s.ran('gh pr view 3');
    assert.equal(listShapes(s.dir).length, 1, 'a command that was never asked about remembers nothing');
    assert.equal(revokeShape(s.dir, { id: 'pr-merge' }), 1);
    assert.equal(s.ask('gh pr merge 3').ask, true, 'revoked: asks again');
  } finally {
    s.cleanup();
  }
});

test('a host whose hook cannot ask hands over without an approval or a run, and a person can approve a shape from the command line', () => {
  const s = setup();
  try {
    assert.equal(s.ask('gh pr merge 3', 'codex').deny, true);
    addShape(s.dir, 'pr-merge');
    assert.ok(quiet(s.ask('gh pr merge 3', 'codex')));
    assert.equal(s.ask('gh pr merge 9', 'codex').deny, true, 'preconditions apply to a remembered approval too');
  } finally {
    s.cleanup();
  }
});

test('shapes that are not grantable, and the always-human commands, keep asking even inside a run', () => {
  const s = setup();
  try {
    s.run(['pr-merge', 'pr-create', 'git-push']);
    assert.ok(quiet(s.ask('git push origin feat/x')), 'a plain push is granted');
    assert.equal(s.ask('gh pr close 2', 'codex').deny, true, 'not in this run\'s grants');
    for (const command of ['gh release create v1', 'git tag v1', 'npm publish']) assert.equal(s.ask(command, 'codex').deny, true, command);
    assert.equal(s.ask('git push --force origin main', 'codex').deny, true);
    assert.equal(s.ask('git push origin main && gh release create v1', 'codex').deny, true, 'one allowed shape does not free the rest of the call');
  } finally {
    s.cleanup();
  }
});

test('the native ask rules drop the shapes the hook decides, only on hosts whose hook can ask', () => {
  const s = setup();
  try {
    const caps = loadCapabilities(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
    const gate = (grantable) => [{ tier: 2, guardrail: 'g', parsed: { kind: 'builtin', id: 'gate-command', args: { classes: 'irreversible,outward', grantable } } }];
    const withGrants = nativeRules('claude-code', gateEntries(gate(GRANTABLE)), caps);
    const without = nativeRules('claude-code', gateEntries(gate('')), caps);
    for (const glob of ['Bash(gh pr merge *)', 'Bash(gh pr create *)', 'Bash(git push *)', 'Bash(gh pr close *)']) {
      assert.ok(without.includes(glob), `${glob} is asked natively without grants`);
      assert.ok(!withGrants.includes(glob), `${glob} is left to the hook with grants`);
    }
    assert.ok(withGrants.includes('Bash(gh release create *)') && withGrants.includes('Bash(git tag *)') && withGrants.includes('Bash(git push -f*)'), 'always-human commands keep their rules');
    const opencode = nativeRules('opencode', gateEntries(gate(GRANTABLE)), caps);
    assert.ok('gh pr merge *' in opencode, 'a host whose hook cannot ask keeps the native rule');
    assert.throws(() => gateEntries(gate('git-tag-create')), /grantable must name approvable commands/);
    assert.deepEqual(APPROVABLE.filter((id) => /tag|release|publish/.test(id)), []);
  } finally {
    s.cleanup();
  }
});

test('mergeTarget reads the pull request a merge command names', () => {
  assert.equal(mergeTarget('gh pr merge 5 --squash'), '5');
  assert.equal(mergeTarget('gh pr merge --squash --delete-branch 5'), '5');
  assert.equal(mergeTarget('gh pr merge --squash --body "x y" 6'), '6');
  assert.equal(mergeTarget('gh pr merge --squash'), null);
  assert.equal(mergeTarget('gh pr view 5'), undefined);
});
