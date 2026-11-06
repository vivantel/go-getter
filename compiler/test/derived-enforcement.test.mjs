// Plan paper-instruments step A7 (paper repo): five advisory-only guardrails now carry a check produced from their own text or parameters.
// Each conversion has a violation that is blocked and a clean case that passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';
import { collectEnforcement, runBuiltin } from '../src/enforce.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8', env: cleanGitEnv(process.env) }).trim();
const tmp = () => mkdtempSync(path.join(tmpdir(), 'gg-derived-'));
const withEnv = async (env, fn) => {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};
const local = { GITHUB_ACTIONS: undefined, GITHUB_HEAD_REF: undefined, GITHUB_EVENT_NAME: undefined, GITHUB_REF_NAME: undefined };

function repo() {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(path.join(dir, 'f'), 'x');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  return dir;
}

test('the five converted guardrails are labelled derived and keep their tier-1 entry', () => {
  const by = Object.groupBy(collectEnforcement(ROOT), (e) => e.guardrail);
  const expected = { 'max-concurrent-agents-rule': 3, 'reviewer-read-only': 3, 'tracker-writes-follow-the-answer': 2, 'changes-land-as-one-squashed-pull-request': 3, 'restricted-data-hosts-rule': 3 };
  for (const [id, tier] of Object.entries(expected)) {
    const derived = by[id].filter((e) => e.origin === 'derived');
    assert.deepEqual(derived.map((e) => e.tier), [tier], id);
    assert.ok(by[id].some((e) => e.tier === 1), `${id} keeps its advisory entry`);
  }
});

test('max-worktrees: more linked worktrees than the limit fails, within it passes', async () => {
  const dir = repo();
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/a', path.join(dir, '..', path.basename(dir) + '-a'));
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/b', path.join(dir, '..', path.basename(dir) + '-b'));
    const run = (max) => runBuiltin(dir, { kind: 'builtin', id: 'max-worktrees', args: { max: String(max) } });
    assert.equal((await run(2)).ok, true);
    const over = await run(1);
    assert.equal(over.ok, false);
    assert.match(over.message, /2 linked worktrees.*limit is 1/);
    assert.equal((await runBuiltin(dir, { kind: 'builtin', id: 'max-worktrees', args: { max: 'x' } })).ok, false);
  } finally {
    for (const s of ['', '-a', '-b']) rmSync(dir + s, { recursive: true, force: true });
  }
});

test('squash-merged-head: a merge commit on the default branch fails, a squash passes, a feature branch is not judged', async () => {
  const dir = repo();
  try {
    const run = () => withEnv(local, () => runBuiltin(dir, { kind: 'builtin', id: 'squash-merged-head', args: {} }));
    assert.equal((await run()).ok, true);
    git(dir, 'checkout', '-q', '-b', 'feat/x');
    writeFileSync(path.join(dir, 'g'), 'y');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'feat: x');
    git(dir, 'checkout', '-q', 'main');
    writeFileSync(path.join(dir, 'h'), 'z');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'chore: diverge');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge pull request', 'feat/x');
    const bad = await run();
    assert.equal(bad.ok, false);
    assert.match(bad.message, /merge commit/);
    // in CI the head is still a merge commit here: a pull request event is not judged, a push to the default branch is
    const ci = (event) => withEnv({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event, GITHUB_REF_NAME: 'main' }, () => runBuiltin(dir, { kind: 'builtin', id: 'squash-merged-head', args: {} }));
    assert.equal((await ci('pull_request')).ok, true);
    assert.equal((await ci('push')).ok, false);
    git(dir, 'checkout', '-q', '-b', 'feat/y');
    assert.equal((await run()).ok, true);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'reset', '-q', '--hard', 'HEAD~1');
    git(dir, 'merge', '-q', '--squash', 'feat/x');
    git(dir, 'commit', '-q', '-m', 'feat: x (#1)');
    assert.equal((await run()).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reviewer-read-only: a reviewer file that can write fails, a read-only one passes on each host format', async () => {
  const dir = tmp();
  const write = (rel, head) => {
    mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), `---\nname: reviewer\n${head}\n---\n\nbody\n`);
  };
  const check = () => runBuiltin(dir, { kind: 'builtin', id: 'reviewer-read-only', args: { role: 'reviewer' } });
  try {
    write('.claude/agents/reviewer.md', 'tools: Read, Grep, Glob');
    write('.opencode/agents/reviewer.md', 'permission:\n  edit: deny\n  bash: deny');
    write('.gemini/agents/reviewer.md', 'tools: ["read_file", "grep_search"]');
    write('.cursor/agents/reviewer.md', 'readonly: true');
    assert.equal((await check()).ok, true);
    write('.claude/agents/reviewer.md', 'tools: Read, Edit, Bash');
    const r = await check();
    assert.equal(r.ok, false);
    assert.match(r.message, /\.claude\/agents\/reviewer\.md: tools include edit, bash/);
    write('.claude/agents/reviewer.md', 'model: x');
    assert.match((await check()).message, /no tool list/);
    write('.claude/agents/reviewer.md', 'tools: Read');
    write('.kilo/agents/reviewer.md', 'permission:\n  edit: allow');
    assert.match((await check()).message, /permission does not deny/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hosts-block-pre-tool: a configured host without a blocking hook fails, hosts that block pass', async () => {
  const dir = tmp();
  const caps = tmp();
  const cap = (host, blocks) => writeFileSync(path.join(caps, `${host}.json`), JSON.stringify({ host, hooks: { config: `.${host}/hooks.json`, blockPreTool: blocks }, agents: { dir: `.${host}/agents` } }));
  try {
    cap('alpha', true);
    cap('beta', false);
    const run = () => runBuiltin(dir, { kind: 'builtin', id: 'hosts-block-pre-tool', args: {}, }, { capabilities: caps });
    assert.equal((await run()).ok, true); // nothing configured
    mkdirSync(path.join(dir, '.alpha'));
    writeFileSync(path.join(dir, '.alpha/hooks.json'), '{}');
    assert.equal((await run()).ok, true);
    mkdirSync(path.join(dir, '.beta'));
    writeFileSync(path.join(dir, '.beta/hooks.json'), '{}');
    const r = await run();
    assert.equal(r.ok, false);
    assert.match(r.message, /beta/);
    // the real capability files: every host go-getter supports blocks
    assert.equal((await runBuiltin(ROOT, { kind: 'builtin', id: 'hosts-block-pre-tool', args: {} })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(caps, { recursive: true, force: true });
  }
});

test('deny-raw-tracker-writes: raw gh issue writes are denied naming the verb, reads and the verb pass', () => {
  const dir = tmp();
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  const source = readFileSync(path.join(ROOT, 'docs/guardrails/tracker-writes-follow-the-answer.md'), 'utf8');
  writeFileSync(path.join(dir, 'docs/guardrails/tracker-writes-follow-the-answer.md'), source);
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  try {
    for (const command of ['gh issue create --title x', 'gh issue comment 3 -b hi', 'gh issue close 3', 'git status && gh issue close 4']) {
      const d = evaluatePreTool(dir, bash(command), 'claude-code');
      assert.equal(d.deny, true, command);
      assert.match(d.reason, /tracker-writes-follow-the-answer/);
      assert.match(d.reason, /go-getter plan issue/);
    }
    for (const command of ['gh issue view 3', 'gh issue list', 'gh pr comment 3 -b x', 'go-getter plan issue create --step A1 --dry-run', 'echo "gh issue create"', 'npm test']) {
      assert.deepEqual(evaluatePreTool(dir, bash(command), 'claude-code'), { deny: false }, command);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
