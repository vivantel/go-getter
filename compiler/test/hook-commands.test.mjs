import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, realpathSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { planApply, writeApply } from '../src/apply.mjs';
import { HOSTS } from '../src/capabilities.mjs';
import { capLines, NUDGE_LINE_BUDGET } from '../src/hook.mjs';

// A host may run its hook commands from a subdirectory of the project, so a command must find the runner itself
// and hand the project root to it instead of relying on the working directory.

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-hookcmd-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(
    path.join(dir, 'docs/guardrails/no-secrets-dir.md'),
    '---\nid: no-secrets-dir\ntitle: no-secrets-dir title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "secrets blocked"\n      run: "builtin:deny-path paths=secrets/**"\n---\n\n## Guardrail\n\nDo it.\n',
  );
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

// Every hook command string a host config carries, with the tool event and host id it names.
function hookCommands(dir) {
  const found = [];
  const visit = (value) => {
    for (const [k, v] of Object.entries(value ?? {})) {
      if ((k === 'command' || k === 'bash') && typeof v === 'string' && / hook /.test(v)) found.push(v);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  for (const rel of ['.claude/settings.json', '.codex/hooks.json', '.cursor/hooks.json', '.gemini/settings.json', '.github/hooks/go-getter.json']) {
    const file = path.join(dir, rel);
    if (existsSync(file)) visit(JSON.parse(readFileSync(file, 'utf8')));
  }
  return found.map((command) => ({ command, event: / hook (\S+) --host /.exec(command)[1], host: /--host (\S+)/.exec(command)[1] }));
}

// Replaces the generated runner with a stub that records its arguments.
function stubRunner(dir) {
  const runner = path.join(dir, '.go-getter/bin/go-getter');
  writeFileSync(runner, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$STUB_OUT"\n');
  chmodSync(runner, 0o755);
}

function nested(dir) {
  const sub = path.join(dir, 'packages/app/src');
  mkdirSync(sub, { recursive: true });
  return sub;
}

test('hook commands of every host find the runner and name the project when run from a subdirectory', () => {
  const dir = project();
  const out = path.join(dir, 'stub.out');
  try {
    writeApply(dir, planApply(dir, { hosts: HOSTS }));
    stubRunner(dir);
    const sub = nested(dir);
    const commands = hookCommands(dir);
    assert.ok(commands.length >= 5, `found hook commands for the JSON-configured hosts, got ${commands.length}`);
    assert.deepEqual(commands.filter((c) => c.event === 'post-tool').map((c) => c.host).sort(), ['claude-code', 'codex', 'copilot', 'gemini-cli'], 'post-tool only where hooks.rewriteOutput');
    for (const { command, event, host } of commands) {
      assert.ok(['pre-tool', 'post-tool'].includes(event), `${host}: ${event}`);
      rmSync(out, { force: true });
      const run = spawnSync('sh', ['-c', command], { cwd: sub, env: { ...process.env, STUB_OUT: out }, input: '{}', encoding: 'utf8' });
      assert.equal(run.status, 0, `${host}: ${run.stderr}`);
      assert.ok(existsSync(out), `${host}: the runner was not reached from a subdirectory`);
      const args = readFileSync(out, 'utf8').trim().split('\n');
      assert.deepEqual(args.slice(0, 4), ['hook', event, '--host', host], host);
      assert.deepEqual(args.slice(4), ['--project', realpathSync(dir)], `${host} names the project root`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the hook plugin file of a host that uses one finds the runner from a subdirectory', () => {
  const dir = project();
  const out = path.join(dir, 'stub.out');
  try {
    const plan = planApply(dir, { hosts: HOSTS });
    writeApply(dir, plan);
    stubRunner(dir);
    const plugins = Object.keys(plan.outputs).filter((rel) => /plugins?\/go-getter\.js$/.test(rel));
    assert.equal(plugins.length, 2, 'Kilo and OpenCode each get a plugin file');
    const sub = nested(dir);
    for (const rel of plugins) {
      rmSync(out, { force: true });
      const copy = path.join(dir, `${rel}.mjs`);
      copyFileSync(path.join(dir, rel), copy);
      const script = `import { GoGetter } from ${JSON.stringify(`file://${copy}`)}; const hooks = await GoGetter(); await hooks['tool.execute.before']({ tool: 'bash' }, { args: {} });`;
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: sub, env: { ...process.env, STUB_OUT: out }, encoding: 'utf8' });
      assert.equal(run.status, 0, `${rel}: ${run.stderr}`);
      assert.ok(existsSync(out), `${rel}: the runner was not reached from a subdirectory`);
      const args = readFileSync(out, 'utf8').trim().split('\n');
      const host = rel.startsWith('.kilo/') ? 'kilo' : 'opencode';
      assert.deepEqual(args.slice(0, 4), ['hook', 'pre-tool', '--host', host], rel);
      assert.deepEqual(args.slice(-2), ['--project', realpathSync(dir)]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Kilo plugin replaces a tool result with the runtime answer and keeps it when there is none', () => {
  const dir = project();
  try {
    writeApply(dir, planApply(dir, { hosts: ['kilo'] }));
    const runner = path.join(dir, '.go-getter/bin/go-getter');
    // Stub: answers { output } for post-tool when $STUB_ANSWER is set, and nothing otherwise.
    writeFileSync(runner, '#!/bin/sh\ncat > /dev/null\n[ "$2" = post-tool ] && [ -n "$STUB_ANSWER" ] && printf \'{"output":"%s"}\' "$STUB_ANSWER"\nexit 0\n');
    chmodSync(runner, 0o755);
    const copy = path.join(dir, 'kilo-plugin.mjs');
    copyFileSync(path.join(dir, '.kilo/plugin/go-getter.js'), copy);
    const script = `import { GoGetter } from ${JSON.stringify(`file://${copy}`)}; const hooks = await GoGetter(); const output = { output: 'raw' }; await hooks['tool.execute.after']({ tool: 'bash' }, output); console.log(output.output);`;
    const sub = nested(dir);
    const run = (answer) => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: sub, env: { ...process.env, STUB_ANSWER: answer }, encoding: 'utf8' });
    assert.equal(run('clean').stdout.trim(), 'clean');
    assert.equal(run('').stdout.trim(), 'raw');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no runner above the working directory a hook warns and lets the call through', () => {
  const elsewhere = mkdtempSync(path.join(tmpdir(), 'gg-hookcmd-none-'));
  const dir = project();
  try {
    writeApply(dir, planApply(dir, { hosts: ['claude-code'] }));
    const [{ command }] = hookCommands(dir);
    const run = spawnSync('sh', ['-c', command], { cwd: elsewhere, input: '{}', encoding: 'utf8' });
    assert.equal(run.status, 0, 'fails open (decision 0019)');
    assert.match(run.stderr, /go-getter: runner not found/);
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

// Minimal POSIX-style word splitting (single quotes, double quotes, backslash), as a host without a shell would do.
function splitArgv(line) {
  const words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && /["\\$`]/.test(line[i + 1])) word += line[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === '\\') {
      word += line[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else {
      word += c;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

test('hook commands also work when a host executes them without a shell', () => {
  const dir = project();
  const out = path.join(dir, 'stub.out');
  try {
    writeApply(dir, planApply(dir, { hosts: HOSTS }));
    stubRunner(dir);
    const sub = nested(dir);
    for (const { command, event, host } of hookCommands(dir)) {
      rmSync(out, { force: true });
      const [file, ...args] = splitArgv(command);
      const run = spawnSync(file, args, { cwd: sub, env: { ...process.env, STUB_OUT: out }, input: '{}', encoding: 'utf8' });
      assert.equal(run.status, 0, `${host}: ${run.error?.message ?? run.stderr}`);
      assert.ok(existsSync(out), `${host}: the runner was not reached without a shell`);
      assert.deepEqual(readFileSync(out, 'utf8').trim().split('\n').slice(0, 4), ['hook', event, '--host', host]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('session nudges stay within a fixed line budget', () => {
  const short = 'a\nb';
  assert.equal(capLines(short), short);
  assert.equal(capLines(''), '');
  const long = Array.from({ length: 50 }, (_, i) => `nudge ${i}`).join('\n');
  const capped = capLines(long).split('\n');
  assert.equal(capped.length, NUDGE_LINE_BUDGET);
  assert.equal(capped.at(-1), `… ${50 - NUDGE_LINE_BUDGET + 1} more nudge lines cut`);
});
