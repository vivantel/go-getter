// The pool isolation gate is advisory on a host without a blocking pre-tool hook, and `doctor` says so without failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enforcementNotes } from '../src/doctor-checks.mjs';

const guardrail = (run) => `---\nid: work-happens-in-pool-worktrees\ntitle: t\nstatus: active\ndate: 2026-11-22\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: c\n      run: ${run}\n---\n\n## Guardrail\n\nx\n`;

test('the note names hosts with no blocking pre-tool hook, only when the pool gate is adopted', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-note-'));
  try {
    mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
    assert.deepEqual(enforcementNotes(dir, { hosts: ['claude-code'] }), []);
    writeFileSync(path.join(dir, 'docs/guardrails/work-happens-in-pool-worktrees.md'), guardrail('builtin:pool-isolation'));
    const caps = { a: { hooks: { blockPreTool: true } }, b: { hooks: { blockPreTool: false } } };
    assert.deepEqual(enforcementNotes(dir, { hosts: ['a', 'b'], caps }), ['the pool isolation gate is advisory on b (no blocking pre-tool hook); the instruction and the git hooks apply there']);
    assert.deepEqual(enforcementNotes(dir, { hosts: ['a'], caps }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
