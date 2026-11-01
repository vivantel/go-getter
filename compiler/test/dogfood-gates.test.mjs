// This repository's own gates (dogfooding, decision 0010): what the project's recorded answers do to the calls an agent makes here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePreTool } from '../src/hook.mjs';
import { writeMode } from '../src/trackers/write.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
