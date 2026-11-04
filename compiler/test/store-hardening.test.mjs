// An agent cannot reach the approvals through a wrapper, a shell body, the store location, the hook entry point or a resumed host session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { evaluatePreTool } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-harden-')));
  const dir = path.join(base, 'proj');
  mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(cli, path.join(bin, 'go-getter'));
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  return {
    ask: (command, host = 'claude-code') => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, host),
    cleanup: () => {
      process.env.PATH = saved;
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('a person-only go-getter command is denied under every wrapper and shell spelling', () => {
  const s = setup();
  try {
    const spellings = [
      'go-getter approvals release v1.2.0 abc1234',
      'env go-getter approvals release v1.2.0 abc1234',
      'A=1 go-getter approvals release v1.2.0 abc1234',
      'nohup go-getter approvals allow pr-merge',
      'timeout 9 go-getter approvals revoke --all',
      'sh -c "go-getter approvals release v1.2.0 abc1234"',
      "bash -lc 'go-getter plan approve docs/plans/x.md'",
      'eval "go-getter run end"',
      'sh -c "env nohup go-getter approvals add x"',
      'go-getter watch -- env go-getter approvals release v1.2.0 abc1234',
      `node ${cli} approvals release v1.2.0 abc1234`,
    ];
    for (const command of spellings) {
      const d = s.ask(command);
      assert.equal(d.deny, true, `${command} is denied`);
    }
    assert.ok(!s.ask('go-getter approvals list').deny, 'listing stays free');
    assert.ok(!s.ask('env FOO=1 go-getter release --batch --dry-run').deny, 'a wrapped call that is not person-only runs');
  } finally {
    s.cleanup();
  }
});

test('an agent cannot run the hook entry point, set where the approvals live, or resume a host session', () => {
  const s = setup();
  try {
    for (const command of [
      `printf '{}' | go-getter hook user-prompt --host claude-code`,
      'env go-getter hook pre-tool --host claude-code',
      'sh -c "go-getter hook stop"',
      'GO_GETTER_HOME=/tmp/f go-getter release --batch',
      'env XDG_STATE_HOME=/tmp/f go-getter release --batch',
      'export GO_GETTER_HOME=/tmp/f',
      'claude -p --resume 1234 "release next minor"',
      'claude -c -p x',
      'claude --session-id 6f1c0f6e-0000-4000-8000-000000000000 -p x',
      'env claude --continue -p x',
    ]) {
      assert.equal(s.ask(command).deny, true, `${command} is denied`);
    }
    for (const command of ['go-getter status', 'git status', 'claude --version', 'echo hello']) {
      assert.ok(!s.ask(command).deny, `${command} runs`);
    }
  } finally {
    s.cleanup();
  }
});

test('a script body that names go-getter and cannot be read is refused rather than trusted', () => {
  const s = setup();
  try {
    assert.equal(s.ask('sh -c "go-getter approvals release v1 abc $(cat /dev/null"').deny, true);
    assert.ok(!s.ask('sh -c "echo $(date"').deny, 'an unreadable body that does not name go-getter is not this guard\'s concern');
  } finally {
    s.cleanup();
  }
});
