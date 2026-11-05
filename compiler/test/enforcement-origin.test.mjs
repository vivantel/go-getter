import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { guardrailProblems } from '../src/checks/guardrails.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { readArtifacts } from '../src/artifacts.mjs';

const guardrail = (id, origin) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-11-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 3\n      check: "${id}"\n      run: "true"${origin ? `\n      origin: ${origin}` : ''}\n---\n\n## Guardrail\n\nDo it.\n`;

function project(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-origin-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  for (const [id, text] of Object.entries(files)) writeFileSync(path.join(dir, 'docs/guardrails', `${id}.md`), text);
  return dir;
}

test('a guardrail with origin: derived and one without both load', () => {
  const dir = project({ 'with-origin': guardrail('with-origin', 'derived'), 'no-origin': guardrail('no-origin') });
  assert.deepEqual(guardrailProblems(readArtifacts(dir, ['guardrails'])), []);
  const origin = Object.fromEntries(collectEnforcement(dir).map((e) => [e.guardrail, e.origin]));
  assert.deepEqual(origin, { 'with-origin': 'derived', 'no-origin': 'authored' });
});

test('origin: authored is accepted', () => {
  const dir = project({ a: guardrail('a', 'authored') });
  assert.deepEqual(guardrailProblems(readArtifacts(dir, ['guardrails'])), []);
});

test('an unknown origin is refused', () => {
  const dir = project({ bad: guardrail('bad', 'generated') });
  const problems = guardrailProblems(readArtifacts(dir, ['guardrails']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /enforcement\[0\]\.origin must be derived or authored/);
});
