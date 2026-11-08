// This repository's own gates (dogfooding, decision 0010): what the project's recorded answers do to the calls an agent makes here.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, after } from 'node:test';
import { evaluatePreTool } from '../src/hook.mjs';
import { writeMode } from '../src/trackers/write.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// A copy of this repository's recorded answers (docs, instruction files, manifest) in a temp repository: the gate writes
// checkpoint refs and telemetry where it runs, and that must not be the checkout.
const repo = mkdtempSync(path.join(tmpdir(), 'gg-dogfood-'));
for (const item of ['docs', 'AGENTS.md', 'CLAUDE.md', 'package.json', '.go-getter/manifest.json', '.claude', '.github']) {
  if (existsSync(path.join(source, item))) cpSync(path.join(source, item), path.join(repo, item), { recursive: true });
}
execFileSync('git', ['init', '-q', '-b', 'feat/dogfood'], { cwd: repo });
after(() => rmSync(repo, { recursive: true, force: true }));
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('the tracker answer is "allow": plan issue create, comment and close run without a stop', () => {
  assert.equal(writeMode(repo), 'allow');
  for (const verb of ['create', 'comment', 'close']) {
    for (const runner of ['go-getter', 'node compiler/bin/go-getter.mjs', 'npx go-getter']) {
      const d = evaluatePreTool(repo, bash(`${runner} plan issue ${verb} T1 docs/plans/roadmap.md`), 'claude-code');
      assert.notEqual(d.deny, true, `${runner} plan issue ${verb}`);
      assert.notEqual(d.ask, true, `${runner} plan issue ${verb}`);
    }
  }
});

test('go-getter pr and ship run without a stop here, a raw push is sent to pr and a raw merge to ship', () => {
  for (const runner of ['go-getter', 'node compiler/bin/go-getter.mjs']) {
    for (const verb of ['pr', 'ship']) {
      const d = evaluatePreTool(repo, bash(`${runner} ${verb} --why "x"`), 'claude-code');
      assert.notEqual(d.deny, true, `${runner} ${verb}`);
      assert.notEqual(d.ask, true, `${runner} ${verb}`);
    }
  }
  const raw = evaluatePreTool(repo, bash('git push origin HEAD'), 'claude-code');
  assert.equal(raw.deny, true);
  assert.match(raw.reason, /go-getter pr/);
  assert.doesNotMatch(raw.reason, /merges on green/);
  const merge = evaluatePreTool(repo, bash('gh pr merge 7 --squash'), 'claude-code');
  assert.equal(merge.deny, true);
  assert.match(merge.reason, /go-getter ship.*merges on green/);
});
