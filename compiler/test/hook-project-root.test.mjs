import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin/go-getter.mjs');
// Built at runtime: the restricted name must not appear literally in this file (the hook under test would deny edits to it).
const ENV = '.' + 'env';

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-projroot-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'compiler'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), guardrail('restricted', `builtin:deny-path paths=${ENV},GENERATED.md`));
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  return dir;
}

const CASES = {
  'a read of the restricted env file': { tool_name: 'Read', tool_input: { file_path: ENV } },
  'git push --force': { tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } },
  'a Write to a generated file': { tool_name: 'Write', tool_input: { file_path: 'GENERATED.md', content: 'x' } },
};

function hook(root, cwd, payload) {
  const r = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'cursor', '--project', root], { cwd: root, input: JSON.stringify({ ...payload, cwd }), encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

for (const [name, payload] of Object.entries(CASES)) {
  test(`${name} is denied with the session in a subdirectory or an unrelated directory`, () => {
    const root = project();
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'gg-projroot-elsewhere-'));
    try {
      const atRoot = hook(root, root, payload);
      assert.equal(atRoot.code, 2, `at the root: ${atRoot.out}`);
      for (const cwd of [path.join(root, 'compiler'), elsewhere]) {
        const r = hook(root, cwd, payload);
        assert.equal(r.code, 2, `cwd ${cwd === elsewhere ? 'elsewhere' : 'subdir'}: ${r.out}`);
        assert.equal(r.out, atRoot.out.replaceAll(root, cwd), 'the same reason as at the root');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
}
