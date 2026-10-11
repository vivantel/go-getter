// What a run never grants and how it scopes tracker writes (decision 0130 items 4 and 5, step 3 of the autonomous-run plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';
import { startRun } from '../src/runs/record.mjs';
import { runsFile } from '../src/runs/record.mjs';
import { addShape } from '../src/secrets/approvals.mjs';
import { shapeAllowance } from '../src/runs/shapes.mjs';
import { gateEntries, nativeRules, matchGated, APPROVABLE } from '../src/gate.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { installGh } from './support/gh-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const PLAN = (n) => `# P — plan\n\n**Status legend**: x\n\n${[1, 2, 3].map((i) => `### ${i} Step ${i} — [ ]\nIssue: #${100 + i}\nClass: implement · Effort: low · Needs: none · Check: \`true\`\nDo: x.\nDone-when: x.\n`).join('\n')}`;
const GATE = 'builtin:gate-command classes=irreversible,outward free=\\"\\" grantable=\\"git-push, pr-create, pr-merge, pr-close, comment-post\\"';
const TRACKER = 'builtin:gate-command classes=\\"\\" go-getter=\\"plan issue create,plan issue comment,plan issue close\\"';

// Everything a run must leave to a human, with a command that does it.
const ALWAYS_HUMAN = {
  'git-push-force': 'git push --force origin main',
  'git-push-delete': 'git push origin :old',
  'git-reset-hard': 'git reset --hard HEAD~3',
  'git-rebase': 'git rebase -i HEAD~3',
  'git-filter-branch': 'git filter-repo --path a',
  'git-branch-delete': 'git branch -D shared',
  'git-tag-delete': 'git tag -d v1',
  'git-tag-create': 'git tag v1',
  'release-create': 'gh release create v1',
  'package-publish': 'npm publish',
  'repo-settings': 'gh repo edit --default-branch dev',
};
const SETTINGS = ['gh secret set TOKEN', 'gh repo delete o/r --yes', 'gh api -X PUT repos/o/r/branches/main/protection', 'gh api repos/o/r/rulesets -X POST -f name=x', 'gh variable delete X'];

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-limits-')));
  const dir = path.join(base, 'proj');
  for (const rel of ['docs/guardrails', 'docs/plans']) mkdirSync(path.join(dir, rel), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN());
  const rule = (id, run) => writeFileSync(path.join(dir, `docs/guardrails/${id}.md`), `---\nid: ${id}\ntitle: ${id}\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: "${run}"\n---\n\n## Guardrail\n\nAsk.\n`);
  rule('gated', GATE);
  rule('tracker', TRACKER);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  installGh(base, { defaultBranch: 'main', currentPr: 1, prs: [] });
  symlinkSync(cli, path.join(base, 'go-getter')); // go-getter on PATH, as the hook recognises it
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${base}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    base, dir,
    ask: (command, host = 'codex') => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, host),
    run: (grants = APPROVABLE, steps = ['1', '2']) => startRun(dir, { plan: 'docs/plans/p.md', steps, grants }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const quiet = (d) => !d.deny && !d.ask;

test('each always-human command matches its own catalog entry, so a freed or granted neighbour cannot cover it', () => {
  for (const [id, command] of Object.entries(ALWAYS_HUMAN)) assert.ok(matchGated(command).some((e) => e.id === id), `${command} is ${id}`);
  for (const command of SETTINGS) assert.ok(matchGated(command).some((e) => e.id === 'repo-settings'), command);
  assert.deepEqual(matchGated('gh api repos/o/r/pulls/1/comments -f body=x').map((e) => e.id), [], 'an ordinary api write is not a settings change');
  assert.deepEqual(APPROVABLE.filter((id) => id in ALWAYS_HUMAN), [], 'no always-human command is approvable');
});

test('inside a run that grants everything it can, and with every approvable shape also remembered, the always-human set is still denied', () => {
  const s = setup();
  try {
    s.run();
    for (const id of APPROVABLE) addShape(s.dir, id);
    for (const command of [...Object.values(ALWAYS_HUMAN), ...SETTINGS]) {
      assert.equal(s.ask(command).deny, true, `${command} on a host whose hook cannot ask`);
    }
    // And a shape the run grants cannot be used to carry one of them along.
    assert.equal(s.ask('git push origin feat/x && git tag v1').deny, true);
    assert.equal(s.ask('git push origin feat/x && gh release create v1').deny, true);
  } finally {
    s.cleanup();
  }
});

test('on a host with native ask rules the always-human set keeps its ask rule, and the hook has no way to lift it', () => {
  const caps = loadCapabilities(root);
  const entries = gateEntries([{ tier: 2, guardrail: 'g', parsed: { kind: 'builtin', id: 'gate-command', args: { classes: 'irreversible,outward', grantable: 'git-push, pr-create, pr-merge, pr-close' } } }]);
  const rules = nativeRules('claude-code', entries, caps);
  for (const glob of ['Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git reset --hard*)', 'Bash(git rebase *)', 'Bash(git branch -D*)', 'Bash(git tag *)', 'Bash(gh release create *)', 'Bash(npm publish *)', 'Bash(gh repo edit *)', 'Bash(gh secret set *)', 'Bash(gh api -X *)']) {
    assert.ok(rules.includes(glob), glob);
  }
});

test('a shape that cannot be approved is refused at every door: the grant, the command line and a hand-edited record', () => {
  const s = setup();
  try {
    const env = { ...process.env };
    for (const id of ['release-create', 'git-tag-create', 'package-publish', 'repo-settings', 'git-push-force']) {
      const grant = spawnSync(process.execPath, [cli, 'run', 'start', 'docs/plans/p.md', '--grant', id], { cwd: s.dir, env, encoding: 'utf8' });
      assert.equal(grant.status, 1, `run start --grant ${id}`);
      const allow = spawnSync(process.execPath, [cli, 'approvals', 'allow', id], { cwd: s.dir, env, encoding: 'utf8' });
      assert.equal(allow.status, 1, `approvals allow ${id}`);
    }
    // A record written by hand (the hook prevents an agent from doing it) cannot grant them either.
    s.run(['pr-merge', 'release-create', 'git-tag-create']);
    const file = runsFile(env);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Object.values(data.projects)[0].active.grants.includes('release-create'));
    for (const id of ['release-create', 'git-tag-create', 'package-publish']) assert.deepEqual(shapeAllowance(s.dir, id, 'x'), { allowed: false, never: true });
    assert.equal(s.ask('gh release create v1').deny, true);
    assert.equal(s.ask('git tag v1').deny, true);
  } finally {
    s.cleanup();
  }
});

test('in a run, plan issue comment and close on a step of the range are free; create and every other step still ask', () => {
  const s = setup();
  try {
    const tracker = (c, host) => s.ask(`go-getter plan issue ${c}`, host);
    assert.equal(tracker('close 1 docs/plans/p.md', 'claude-code').ask, true, 'no run: asks');
    s.run(['pr-merge'], ['1', '2']);
    for (const host of ['claude-code', 'codex']) {
      assert.ok(quiet(tracker('comment 1 docs/plans/p.md --text hi', host)), `comment, ${host}`);
      assert.ok(quiet(tracker('close 2 docs/plans/p.md', host)), `close, ${host}`);
      assert.ok(quiet(tracker('close 2', host)), `close with the only plan, ${host}`);
      assert.ok(quiet(tracker('--dry-run close 2 docs/plans/p.md', host)));
    }
    assert.equal(tracker('create 1 docs/plans/p.md', 'claude-code').ask, true, 'create asks');
    assert.equal(tracker('create 1 docs/plans/p.md', 'codex').deny, true);
    assert.equal(tracker('close 3 docs/plans/p.md', 'claude-code').ask, true, 'a step outside the range asks');
    assert.equal(tracker('comment 9 docs/plans/p.md', 'claude-code').ask, true, 'an unknown step asks');
    assert.equal(tracker('close 1 docs/plans/other.md', 'claude-code').ask, true, 'another plan asks');
    assert.equal(tracker('close 3 docs/plans/p.md', 'codex').deny, true);
  } finally {
    s.cleanup();
  }
});
