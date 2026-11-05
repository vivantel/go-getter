// The bypass script (evals/bypass.mjs): every class has a prediction and an attempt, the predictions are the two allowed
// words, and a deliberately weakened check in a scratch copy makes the matching class report `passes`. The real
// guardrails are never edited: `weaken` is handed the scratch project only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PREDICTIONS, ATTEMPTS, runBypass } from '../../evals/bypass.mjs';

test('every class has one attempt and a predicted outcome of blocked or passes', () => {
  assert.deepEqual(Object.keys(ATTEMPTS).sort(), Object.keys(PREDICTIONS).sort());
  for (const [id, [predicted, why]] of Object.entries(PREDICTIONS)) {
    assert.ok(['blocked', 'passes'].includes(predicted), `${id}: ${predicted}`);
    assert.ok(why.length > 10, `${id} states why`);
  }
});

test('the suite header says the adversary is the author and the predictions precede the first run', () => {
  const head = readFileSync(new URL('../../evals/bypass.mjs', import.meta.url), 'utf8').split('\n').slice(0, 30).join('\n');
  assert.match(head, /adversary is the author's side/);
  assert.match(head, /before the suite was run for the first time/);
});

test('weakening a check in a scratch copy makes the matching class report passes', () => {
  const edit = (dir, guardrail, from, to) => {
    const file = path.join(dir, 'docs/guardrails', `${guardrail}.md`);
    const text = readFileSync(file, 'utf8');
    assert.ok(text.includes(from), `${guardrail} holds ${from}`);
    writeFileSync(file, text.replaceAll(from, to));
  };
  const only = ['T2-read-tool-restricted', 'T3-commit-private-key'];
  const intact = runBypass({ only });
  assert.deepEqual(intact.map((r) => r.observed), ['blocked', 'blocked']);
  const weakened = runBypass({
    only,
    weaken: (dir) => {
      edit(dir, 'restricted-paths-denied', 'paths=".env, .env.*, *.pem, *.key, id_rsa, id_ed25519"', 'paths="no-such-name"');
      edit(dir, 'no-secrets-in-added-lines', 'builtin:secret-scan allow=""', 'builtin:secret-scan allow="**"');
    },
  });
  assert.deepEqual(weakened.map((r) => [r.id, r.observed, r.match]), [
    ['T2-read-tool-restricted', 'passes', false],
    ['T3-commit-private-key', 'passes', false],
  ]);
});
