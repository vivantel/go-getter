import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planApply, writeApply } from '../src/apply.mjs';
import { runTier3 } from '../src/enforce.mjs';

// Another tool's block in the instruction file (decision 0075): apply leaves it alone and the cap counts it.
const FOREIGN = ['<!-- OPENSPEC:START -->', '# OpenSpec Instructions', '', 'Open `@/openspec/AGENTS.md` when the request mentions planning or proposals.', '<!-- OPENSPEC:END -->'].join('\n');

function project(foreignLines = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-coexist-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  const padding = Array.from({ length: foreignLines }, (_, i) => `line ${i}`).join('\n');
  writeFileSync(path.join(dir, 'AGENTS.md'), `# Project\n\n${FOREIGN.replace('# OpenSpec Instructions', `# OpenSpec Instructions${padding ? `\n${padding}` : ''}`)}\n\nHand-written outro.\n`);
  writeFileSync(
    path.join(dir, 'docs/guardrails/agents-cap.md'),
    '---\nid: agents-cap\ntitle: agents-cap title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 3\n      check: "cap"\n      run: "builtin:file-max-lines path=AGENTS.md max=60"\n---\n\n## Guardrail\n\nDo it.\n',
  );
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

test("apply leaves another tool's block byte-identical, on the first and the second run", () => {
  const dir = project();
  try {
    for (let run = 0; run < 2; run++) {
      writeApply(dir, planApply(dir, { hosts: ['claude-code'] }));
      const agents = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
      assert.ok(agents.includes(FOREIGN), `foreign block intact after run ${run + 1}`);
      assert.match(agents, /Hand-written outro\./);
      assert.equal(agents.split('<!-- go-getter:start -->').length, 2, 'one go-getter section');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the instruction-file cap counts the other tool\'s block', async () => {
  const small = project();
  const big = project(70);
  try {
    assert.deepEqual((await runTier3(small)).map((r) => r.ok), [true]);
    const [r] = await runTier3(big);
    assert.equal(r.ok, false);
    assert.match(r.message, /cap is 60/);
  } finally {
    rmSync(small, { recursive: true, force: true });
    rmSync(big, { recursive: true, force: true });
  }
});
