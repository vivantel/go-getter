import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planApply, writeApply } from '../src/apply.mjs';
import { HOSTS } from '../src/capabilities.mjs';

function guardrail(id, run) {
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 3\n      check: "c"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo it.\n`;
}

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-first-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/cap.md'), guardrail('cap', 'builtin:file-max-lines path=AGENTS.md max=60'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

test('a first apply over an existing foreign hook refuses without --force', () => {
  const dir = fresh();
  mkdirSync(path.join(dir, '.githooks'), { recursive: true });
  const mine = '#!/bin/sh\necho my own pre-push\n';
  writeFileSync(path.join(dir, '.githooks/pre-push'), mine, { mode: 0o755 });
  const plan = planApply(dir, { hosts: HOSTS });
  assert.ok(plan.modified.some((m) => m.path === '.githooks/pre-push'), 'the foreign file is reported as modified');
  writeApply(dir, plan);
  assert.equal(readFileSync(path.join(dir, '.githooks/pre-push'), 'utf8'), mine);
  writeApply(dir, planApply(dir, { hosts: HOSTS, force: true }));
  assert.notEqual(readFileSync(path.join(dir, '.githooks/pre-push'), 'utf8'), mine);
});
