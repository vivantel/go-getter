import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin/go-getter.mjs');

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-failmode-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  return dir;
}

const WRITE = { tool_name: 'Write', tool_input: { file_path: 'a.txt', content: 'x' } };
const SHELL = { tool_name: 'Bash', tool_input: { command: 'ls' } };
const READ = { tool_name: 'Read', tool_input: { file_path: 'a.txt' } };

// One case per failure. `break` damages the project; `repair` puts it right again (what the printed fix does).
const CASES = {
  'a malformed payload': { stdin: '{not json', break() {}, repair() {} },
  'an unreadable guardrails directory': {
    break(dir) {
      rmSync(path.join(dir, 'docs/guardrails'), { recursive: true });
      writeFileSync(path.join(dir, 'docs/guardrails'), 'not a directory');
    },
    repair(dir) {
      rmSync(path.join(dir, 'docs/guardrails'));
      mkdirSync(path.join(dir, 'docs/guardrails'));
      writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
    },
    names: 'docs/guardrails',
  },
  'an unparseable guardrail': {
    break: (dir) => writeFileSync(path.join(dir, 'docs/guardrails/broken.md'), '---\nid: [unclosed\n  bad: : :\n---\n'),
    repair: (dir) => rmSync(path.join(dir, 'docs/guardrails/broken.md')),
    names: 'broken.md',
  },
  'a check that throws': {
    break: (dir) => writeFileSync(path.join(dir, 'docs/guardrails/deny.md'), guardrail('deny', 'x').replace(/run: 'x'/, 'run: 5')),
    repair: (dir) => rmSync(path.join(dir, 'docs/guardrails/deny.md')),
    names: 'deny',
  },
  'a bad regex in a gate': {
    break: (dir) => writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible extra=/(/')),
    repair: (dir) => writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward')),
    names: 'gated-actions',
    shell: true,
  },
};

function hook(dir, payload, stdin, host = 'cursor') {
  const r = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', host, '--project', dir], { cwd: dir, input: stdin ?? JSON.stringify(payload), encoding: 'utf8' });
  return { code: r.status, err: r.stderr, out: r.stdout };
}

for (const [name, c] of Object.entries(CASES)) {
  test(`pre-tool fails closed on ${name}, says how to repair it, and passes after the repair`, () => {
    const dir = project();
    try {
      c.break(dir);
      const payload = c.shell ? SHELL : WRITE;
      const blocked = hook(dir, payload, c.stdin);
      assert.equal(blocked.code, 2, `exit code; stderr: ${blocked.err}`);
      const lines = blocked.err.trim().split('\n');
      assert.match(lines[0], /go-getter: enforcement could not run/, 'which check failed');
      if (c.names) assert.ok(blocked.err.includes(c.names), `names ${c.names}`);
      assert.match(blocked.err, /go-getter doctor/, 'the repair command');
      assert.match(blocked.err, /go-getter approvals allow/, 'the one-call route for a person');
      assert.ok(!blocked.err.includes('a.txt') && !blocked.err.includes('"ls"'), 'no command text in the reason');
      c.repair(dir);
      if (!c.stdin) assert.equal(hook(dir, payload).code, 0, 'the same call passes after the repair');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('read-only tool calls still pass when enforcement is broken', () => {
  const dir = project();
  try {
    CASES['an unparseable guardrail'].break(dir);
    assert.equal(hook(dir, READ).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failure is recorded as outcome fail with its trigger', () => {
  const dir = project();
  try {
    mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/decisions/0051-rec.md'), '---\nid: 0051-rec\ntitle: rec\nstatus: active\ndate: 2026-11-05\ntags: [observability]\ntrack: process\ngo-getter:\n  telemetry-recording: "metadata-log"\n---\n\n## Decision\n\nx\n\n## Why\n\nx\n');
    CASES['an unparseable guardrail'].break(dir);
    hook(dir, WRITE);
    const logs = spawnSync(process.execPath, [cli, 'telemetry', 'summary', '--project', dir], { cwd: dir, encoding: 'utf8' });
    const summary = JSON.parse(logs.stdout);
    assert.equal(summary.outcomes.fail, 1);
    assert.equal(summary.triggers['pre-tool:internal-error'], 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
