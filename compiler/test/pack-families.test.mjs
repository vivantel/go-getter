// Harness packs are domain-neutral: they name no hosting provider (decision 0129). Practice packs (family sdlc) may.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packs = readdirSync(path.join(root, 'src/packs')).map((id) => JSON.parse(readFileSync(path.join(root, 'src/packs', id, 'pack.json'), 'utf8')));
const HOSTING = /\b(?:gh|GitHub|GitLab|Bitbucket|PRs?)\b/;
// Text a person reads: prompts, labels, tradeoffs, titles and bodies. Ids, patterns, defaults and run lines are code.
const SKIP = new Set(['id', 'pattern', 'default', 'run', 'detect', '$schema', 'slug', 'grounded-in', 'governed-by', 'since']);
function* texts(value, where = '') {
  if (typeof value === 'string') yield [where, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* texts(v, `${where}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!SKIP.has(k)) yield* texts(v, `${where}/${k}`);
}

test('every pack declares a family, and the practice packs are exactly git-workflow and tracker', () => {
  assert.ok(packs.every((p) => ['harness', 'sdlc'].includes(p.family)));
  assert.deepEqual(packs.filter((p) => p.family === 'sdlc').map((p) => p.id).sort(), ['git-workflow', 'tracker']);
  assert.ok(packs.filter((p) => p.family === 'harness').every((p) => p.components?.length), 'every harness pack covers a component');
});

test('harness packs name no hosting provider, except hitl explaining which provider supplies the gated commands', () => {
  const found = [];
  for (const p of packs.filter((x) => x.family === 'harness')) {
    for (const [where, text] of texts(p)) {
      // hitl's free-commands prompt names GitHub once: the provider that the gated-command ids are translated for.
      const allowed = p.id === 'hitl' && /^\/questions\[\d+\]\/prompt$/.test(where) && /hosting provider \(GitHub\)/.test(text);
      const rest = allowed ? text.replace(/hosting provider \(GitHub\) supplies its commands\.|GitHub-named ids \(gh-pr, gh-pr-merge and the like\)/g, '') : text;
      if (HOSTING.test(rest)) found.push(`${p.id}${where}: ${rest.match(HOSTING)[0]}`);
    }
  }
  assert.deepEqual(found, []);
});
