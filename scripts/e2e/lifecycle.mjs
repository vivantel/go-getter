#!/usr/bin/env node
// End-to-end lifecycle test with a real Claude Code: install the plugin from this checkout into an isolated config dir,
// set up the harness on a scratch repository through the go-getter-init skill, run the generated checks, then ship a
// change with `go-getter ship` (a stateful fake `gh` stands in for GitHub, so nothing leaves the machine) both from the
// shell and by asking Claude to do it.
//
//   node scripts/e2e/lifecycle.mjs [--keep] [--budget <usd>] [--skip-claude-ship]
//
// Needs `claude` on PATH, Node 22+, git, and a Claude login. The login is read as a short-lived access token
// (CLAUDE_CODE_OAUTH_TOKEN, else ~/.claude/.credentials.json) and handed to the child processes through the environment
// only: the credentials file is never copied (a copy makes Claude try to refresh, which can invalidate the original) and
// the token is never printed or written. Not part of `npm test`: it needs network and spends a little (about $0.15-0.50).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const budget = args.includes('--budget') ? args[args.indexOf('--budget') + 1] : '3';
const skipClaudeShip = args.includes('--skip-claude-ship');

function token() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const file = path.join(homedir(), '.claude/.credentials.json');
  if (!existsSync(file)) return null;
  const o = JSON.parse(readFileSync(file, 'utf8')).claudeAiOauth;
  return o && o.expiresAt > Date.now() ? o.accessToken : null;
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`ok   ${name}${note ? ` — ${note}` : ''} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name} — ${String(err.message).split('\n').slice(0, 6).join('\n     ')}`);
    throw err;
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const tok = token();
if (!tok || spawnSync('claude', ['--version']).status !== 0) {
  console.log('skip: needs the claude CLI and a current Claude login (run `claude` once, or set CLAUDE_CODE_OAUTH_TOKEN)');
  process.exit(0);
}

const sandbox = mkdtempSync(path.join(tmpdir(), 'gg-e2e-'));
const cfg = path.join(sandbox, 'claude-config');
const proj = path.join(sandbox, 'proj');
const remote = path.join(sandbox, 'remote.git');
const bin = path.join(sandbox, 'bin');
const ghState = path.join(sandbox, 'gh-state.json');
mkdirSync(cfg);
mkdirSync(bin);
mkdirSync(proj);
symlinkSync(path.join(root, 'compiler/test/support/fake-gh.mjs'), path.join(bin, 'gh'));
chmodSync(path.join(root, 'compiler/test/support/fake-gh.mjs'), 0o755);

const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_OAUTH_TOKEN: tok, PATH: `${bin}:${process.env.PATH}`, GH_FAKE_STATE: ghState, GO_GETTER_SHIP_NO_CI_GRACE_MS: '0' };
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const git = (...a) => run('git', a);
// No bypass mode: the sandboxed Claude may edit files in the scratch project and run only these commands; anything else is refused.
const ALLOWED = 'Skill Read Write Edit Glob Grep Bash(go-getter *) Bash(.go-getter/bin/go-getter *) Bash(node *) Bash(git *) Bash(ls *) Bash(cat *) Bash(mkdir *) Bash(pwd) Bash(echo *)';
const claude = (prompt, { allowed = ALLOWED } = {}) => {
  const out = run('claude', ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', allowed, '--max-budget-usd', budget, '--output-format', 'json'], { timeout: 15 * 60_000 });
  const j = JSON.parse(out);
  return { text: j.result ?? '', cost: j.total_cost_usd ?? 0, turns: j.num_turns ?? 0 };
};
const goGetter = (...a) => spawnSync(path.join(proj, '.go-getter/bin/go-getter'), a, { cwd: proj, env, encoding: 'utf8' });
let spent = 0;

try {
  await step('install: marketplace add + plugin install from this checkout', () => {
    run('claude', ['plugin', 'marketplace', 'add', root], { cwd: sandbox });
    run('claude', ['plugin', 'install', 'go-getter@go-getter'], { cwd: sandbox });
    const list = run('claude', ['plugin', 'list'], { cwd: sandbox });
    assert(/go-getter@go-getter[\s\S]*enabled/.test(list), `plugin not enabled:\n${list}`);
  });

  await step('scratch repository with a bare origin', () => {
    git('init', '-q', '--bare', '-b', 'main', remote);
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'e2e@example.test');
    git('config', 'user.name', 'e2e');
    git('remote', 'add', 'origin', remote);
    writeFileSync(path.join(proj, 'package.json'), '{"name":"scratch","version":"1.0.0","scripts":{"test":"node -e 0"}}\n');
    writeFileSync(path.join(proj, 'README.md'), '# scratch\n');
    git('add', '-A');
    git('commit', '-qm', 'chore: init');
    git('push', '-q', '-u', 'origin', 'main');
    git('remote', 'set-head', 'origin', '-a');
  });

  await step('configure: Claude runs go-getter-init and takes every recommended default', () => {
    const r = claude('Set up the agent harness here with the go-getter-init skill, harness packs and sdlc packs. I use Claude Code only. I am not available to answer: for every question take the recommended option, then run apply and report what you wrote.');
    spent += r.cost;
    const decisions = existsSync(path.join(proj, 'docs/decisions')) ? readdirSync(path.join(proj, 'docs/decisions')).filter((f) => /^\d{4}-/.test(f)) : [];
    assert(decisions.length > 5, `expected decisions under docs/decisions, found ${decisions.length}; Claude said: ${r.text.slice(0, 400)}`);
    assert(existsSync(path.join(proj, '.go-getter/bin/go-getter')), 'apply did not write the project runner .go-getter/bin/go-getter');
    assert(existsSync(path.join(proj, '.claude/settings.json')), `apply wrote no .claude/settings.json (the host hook); Claude said: ${r.text.slice(0, 300)}`);
    git('switch', '-qc', 'feat/e2e-hello'); // the configured project refuses work on the default branch
    return `${decisions.length} decisions, ${r.turns} turns, $${r.cost.toFixed(2)}`;
  });

  await step('generated checks pass on the configured project', () => {
    const r = goGetter('check');
    assert(r.status === 0, `go-getter check failed:\n${r.stdout}${r.stderr}`);
    return r.stdout.trim().split('\n').pop();
  });

  await step('ship from the shell: commit, push, pull request, CI, squash merge', () => {
    writeFileSync(path.join(proj, 'hello.txt'), 'hello\n');
    writeFileSync(ghState, JSON.stringify({ checks: [[{ name: 'ci', bucket: 'pass' }]] }));
    const r = goGetter('ship', '--why', 'Prove the lifecycle works from install to ship.', '--interval', '0');
    assert(r.status === 0, `ship failed (${r.status}):\n${r.stdout}${r.stderr}`);
    const gh = JSON.parse(readFileSync(ghState, 'utf8'));
    assert(gh.pr?.state === 'MERGED' && gh.merged?.squash, `pull request not merged: ${JSON.stringify(gh.pr)}`);
    assert(/Prove the lifecycle/.test(git('log', '-1', '--format=%b')), 'commit body lost the intent');
    assert(git('ls-remote', 'origin', 'refs/heads/feat/e2e-hello').includes('refs/heads/feat/e2e-hello'), 'branch not pushed');
    return gh.pr.title;
  });

  if (!skipClaudeShip) {
    await step('ship by Claude without an approval: the project gate stops it and nothing merges', () => {
      git('switch', '-qc', 'feat/e2e-claude');
      writeFileSync(ghState, JSON.stringify({ checks: [[{ name: 'ci', bucket: 'pass' }]] }));
      // The ship command is left off the allowlist, so the project's pre-tool hook decides (ask, which a non-interactive run cannot answer).
      const allowed = ALLOWED.replace('Bash(.go-getter/bin/go-getter *) ', '').replace('Bash(go-getter *) ', '');
      const r = claude('Create notes.txt containing one line "hello from claude", then ship it by running `.go-getter/bin/go-getter ship --why "Prove an agent cannot ship without approval." --interval 0`. If a command is refused or needs approval, do not work around it: report exactly what was refused and why.', { allowed });
      spent += r.cost;
      const gh = existsSync(ghState) ? JSON.parse(readFileSync(ghState, 'utf8')) : {};
      assert(gh.pr?.state !== 'MERGED', 'the pull request was merged although the gate should have stopped it');
      assert(/approv|gate|guardrail|permission|refus|denied|blocked|outside this machine/i.test(r.text), `no sign of the gate in Claude's report: ${r.text.slice(0, 500)}`);
      return `stopped, $${r.cost.toFixed(2)}`;
    });
  }
  console.log(`\nlifecycle: ${results.length}/${results.length} steps passed, Claude spend $${spent.toFixed(2)}`);
} catch {
  console.log(`\nlifecycle: FAILED after ${results.filter((r) => r.ok).length} passed step(s); sandbox kept at ${sandbox}`);
  process.exitCode = 1;
} finally {
  if (keep || process.exitCode) console.log(`sandbox: ${sandbox}`);
  else rmSync(sandbox, { recursive: true, force: true });
}
