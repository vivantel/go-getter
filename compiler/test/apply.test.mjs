import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, lstatSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { planApply, writeApply, diffApply, upsert, withSection } from '../src/apply.mjs';
import { evaluatePreTool, respond, candidatePaths } from '../src/hook.mjs';
import { runTier3 } from '../src/enforce.mjs';
import { HOSTS } from '../src/capabilities.mjs';
import { globToRegExp, matchesAny } from '../src/glob.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(repoRoot, 'compiler/bin/go-getter.mjs');

function guardrail(id, enforcement, body = 'Do it.') {
  const lines = enforcement.map((e) => `    - tier: ${e.tier}\n      check: "${e.check}"\n      run: "${e.run}"`).join('\n');
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n${lines}\n---\n\n## Guardrail\n\n${body}\n`;
}

function project({ tier2 = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-apply-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nHand-written intro.\n');
  writeFileSync(path.join(dir, 'docs/guardrails/agents-cap.md'), guardrail('agents-cap', [{ tier: 3, check: 'cap', run: 'builtin:file-max-lines path=AGENTS.md max=60' }]));
  if (tier2) writeFileSync(path.join(dir, 'docs/guardrails/no-env.md'), guardrail('no-env', [{ tier: 2, check: 'env blocked', run: 'builtin:deny-path paths=.env,secrets/**' }]));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-hook.sh' }] }] } }));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

test('glob matching follows gitignore conventions', () => {
  assert.ok(matchesAny('config/.env', ['.env']));
  assert.ok(matchesAny('secrets/a/b.json', ['secrets/**']));
  assert.ok(!matchesAny('src/secrets.js', ['secrets/**']));
  assert.ok(matchesAny('certs/server.key', ['*.key']));
  assert.ok(globToRegExp('secrets/').test('secrets/x'));
});

test('apply for all hosts installs hooks, keeps user settings and is idempotent', () => {
  const dir = project();
  const plan = planApply(dir, { hosts: HOSTS });
  writeApply(dir, plan);
  const cc = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(cc.model, 'x');
  assert.equal(cc.hooks.PreToolUse.length, 2);
  assert.equal(cc.hooks.PreToolUse[0].hooks[0].command, 'user-hook.sh');
  assert.match(cc.hooks.PreToolUse[1].hooks[0].command, /\.go-getter\/bin\/go-getter hook pre-tool --host claude-code/);
  for (const f of ['.codex/hooks.json', '.cursor/hooks.json', '.github/hooks/go-getter.json', '.opencode/plugins/go-getter.js', '.githooks/pre-push', '.go-getter/bin/go-getter']) {
    assert.ok(lstatSync(path.join(dir, f)).isFile(), f);
  }
  const gemini = JSON.parse(readFileSync(path.join(dir, '.gemini/settings.json'), 'utf8'));
  assert.deepEqual(gemini.context.fileName, ['AGENTS.md']);
  assert.ok(gemini.hooks.BeforeTool[0].hooks[0].command.includes('--host gemini-cli'));
  assert.equal(readlinkSync(path.join(dir, 'CLAUDE.md')), 'AGENTS.md');
  const agents = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith('# Project\n\nHand-written intro.\n'));
  assert.match(agents, /Blocked by host hooks[\s\S]*no-env title/);
  assert.equal(execFileSync('git', ['config', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim(), '.githooks');
  // Second run changes nothing.
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts: HOSTS })), []);
  writeApply(dir, planApply(dir, { hosts: HOSTS }));
  assert.equal(JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PreToolUse.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('removing the last tier-2 guardrail removes go-getter hooks but not user hooks', () => {
  const dir = project();
  writeApply(dir, planApply(dir, { hosts: ['claude-code'] }));
  rmSync(path.join(dir, 'docs/guardrails/no-env.md'));
  const plan = planApply(dir, { hosts: ['claude-code'] });
  assert.ok(diffApply(dir, plan).includes('differs: .claude/settings.json'));
  writeApply(dir, plan);
  const cc = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(cc.hooks.PreToolUse.map((h) => h.hooks[0].command), ['user-hook.sh']);
  rmSync(dir, { recursive: true, force: true });
});

test('section and hook-list helpers', () => {
  assert.equal(withSection('# A\n', 'S'), '# A\n\nS\n');
  const once = withSection('# A\n', '<!-- go-getter:start -->old<!-- go-getter:end -->');
  assert.equal(withSection(once, '<!-- go-getter:start -->new<!-- go-getter:end -->'), '# A\n\n<!-- go-getter:start -->new<!-- go-getter:end -->\n');
  assert.deepEqual(upsert([{ a: 1 }, { command: '.go-getter/bin/go-getter hook x' }], null), [{ a: 1 }]);
});

test('hook runtime blocks denied paths in each host format', () => {
  const dir = project();
  const read = { tool_name: 'Read', tool_input: { file_path: path.join(dir, '.env') } };
  const bash = { tool_name: 'Bash', tool_input: { command: 'cat secrets/prod/key.json | head' } };
  const ok = { tool_name: 'Read', tool_input: { file_path: 'src/index.js' } };
  assert.ok(candidatePaths(read, dir).includes('.env'));
  assert.equal(evaluatePreTool(dir, read).deny, true);
  assert.equal(evaluatePreTool(dir, bash).deny, true);
  assert.equal(evaluatePreTool(dir, ok).deny, false);
  assert.equal(respond('claude-code', evaluatePreTool(dir, read)).code, 2);
  const cp = respond('copilot', evaluatePreTool(dir, read));
  assert.equal(cp.code, 0);
  assert.equal(JSON.parse(cp.stdout).permissionDecision, 'deny');
  // Through the CLI, as a host would call it.
  const res = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(read), encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /blocked by guardrail no-env/);
  const allowed = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], { input: JSON.stringify(ok), encoding: 'utf8' });
  assert.equal(allowed.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('go-getter check runs tier-3 guardrails and fails on a violation', async () => {
  const dir = project({ tier2: false });
  assert.deepEqual((await runTier3(dir)).map((r) => r.ok), [true]);
  writeFileSync(path.join(dir, 'AGENTS.md'), 'x\n'.repeat(61));
  const results = await runTier3(dir);
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /61 lines, cap is 60/);
  const res = spawnSync(process.execPath, [cli, 'check', '--project', dir], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FAIL agents-cap/);
  rmSync(dir, { recursive: true, force: true });
});
