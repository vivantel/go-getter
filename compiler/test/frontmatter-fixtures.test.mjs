// Holds go-getter's frontmatter reader to kms's parse fixtures (vendored under kms-frontmatter/cases, decision b3-1).
// Each case has `data` (parsed mapping or null) and `error` (null or the start of the checker's message).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../src/frontmatter.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kms-frontmatter', 'cases');

// Dates and versions stay strings in this reader, as the fixtures expect; only the error class needs mapping.
function read(text) {
  try {
    const r = parseFrontmatter(text);
    if (!r.hasFrontmatter) return { data: null, error: 'no frontmatter' };
    return { data: r.unreadable ? null : r.data, error: r.error ?? null };
  } catch (e) {
    return { data: null, error: e.message.startsWith('frontmatter is not a mapping') ? 'frontmatter is not a mapping' : 'unparseable frontmatter' };
  }
}

const cases = readdirSync(dir).filter((f) => f.endsWith('.expected.json')).map((f) => f.slice(0, -'.expected.json'.length));

test('kms frontmatter fixtures are present', () => assert.ok(cases.length >= 12));

for (const name of cases) {
  test(`frontmatter fixture ${name}`, () => {
    const exp = JSON.parse(readFileSync(path.join(dir, `${name}.expected.json`), 'utf8'));
    assert.deepEqual(read(readFileSync(path.join(dir, `${name}.md`), 'utf8')), exp);
  });
}

test('an unterminated block keeps the text after its data as the body', () => {
  const r = parseFrontmatter('---\nid: x\n\nBody text\n');
  assert.equal(r.error, 'unterminated frontmatter');
  assert.equal(r.body, '\nBody text\n');
});
