import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseYaml, stringifyYaml, stringifyFrontmatter } from '../src/frontmatter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? markdownFiles(p) : p.endsWith('.md') ? [p] : [];
  });
}

test('scalars keep dates and versions as strings', () => {
  assert.deepEqual(parseYaml('a: 2026-10-04\nb: 0.15.0\nc: 3\nd: 1.25\ne: true\nf: ~\ng: "x: y"'), {
    a: '2026-10-04',
    b: '0.15.0',
    c: 3,
    d: 1.25,
    e: true,
    f: null,
    g: 'x: y',
  });
});

test('inline lists, flow maps and quoted strings', () => {
  assert.deepEqual(parseYaml('tags: [a, b-c]\nm: {id: gpt-6.1-sol, input: 2, note: "a, b"}\ns: \'it\'\'s\''), {
    tags: ['a', 'b-c'],
    m: { id: 'gpt-6.1-sol', input: 2, note: 'a, b' },
    s: "it's",
  });
});

test('nested maps, lists of maps and comments', () => {
  const src = [
    'go-getter:',
    '  enforcement:',
    '    - tier: 3            # comment',
    '      check: "uses # inside quotes"',
    '      run: "npm run check:generated"',
    '    - tier: 1',
    '  models:',
    '    - {id: a, input: 1}',
    'list:',
    '- x',
    '- y',
  ].join('\n');
  assert.deepEqual(parseYaml(src), {
    'go-getter': {
      enforcement: [{ tier: 3, check: 'uses # inside quotes', run: 'npm run check:generated' }, { tier: 1 }],
      models: [{ id: 'a', input: 1 }],
    },
    list: ['x', 'y'],
  });
});

test('block scalars and plain continuation lines', () => {
  const src = 'folded: >\n  one\n  two\n\n  three\nliteral: |-\n  a\n  b\nplain: first\n  second\n';
  assert.deepEqual(parseYaml(src), { folded: 'one two\nthree\n', literal: 'a\nb', plain: 'first second' });
});

test('a folded scalar ending the frontmatter has no trailing newline (YAML clip at end of input)', () => {
  assert.equal(parseFrontmatter('---\nnote: >\n  a\n  b\n---\nbody').data.note, 'a b');
  assert.equal(parseYaml('note: >\n  a\n').note, 'a\n');
});

test('errors name the line', () => {
  assert.throws(() => parseYaml('a: 1\n  b: 2'), /line 2/);
  assert.throws(() => parseYaml('a: 1\na: 2'), /duplicate key/);
  assert.throws(() => parseYaml('a: [1, 2'), /line 1/);
});

test('stringify round-trips', () => {
  const data = {
    id: 'x',
    tags: ['a', 'b'],
    date: '2026-10-04',
    n: 3,
    quoted: 'needs: quotes',
    numberish: '42',
    'go-getter': { enforcement: [{ tier: 3, check: 'c # d', run: 'npm run x' }], 'generated-by': 'p@0.1.0' },
  };
  assert.deepEqual(parseYaml(stringifyYaml(data)), data);
  const doc = stringifyFrontmatter(data, '\n## Body\n');
  assert.deepEqual(parseFrontmatter(doc), { data, body: '\n## Body\n', hasFrontmatter: true });
});

test('every docs/ artifact frontmatter parses', () => {
  const files = markdownFiles(path.join(root, 'docs'));
  assert.ok(files.length > 30);
  for (const f of files) {
    const { data, hasFrontmatter } = parseFrontmatter(readFileSync(f, 'utf8'));
    if (f.includes(`${path.sep}plans${path.sep}`) || f.endsWith('INDEX.md')) continue;
    assert.ok(hasFrontmatter, `${f} has frontmatter`);
    assert.equal(typeof data.id, 'string', `${f} has id`);
  }
});

test('guardrail enforcement and model lists parse to structured data', () => {
  const g = parseFrontmatter(readFileSync(path.join(root, 'docs/guardrails/no-runtime-dependencies.md'), 'utf8'));
  assert.deepEqual(g.data['go-getter'].enforcement[0], {
    tier: 3,
    check: 'package.json has no dependencies (devDependencies allowed)',
    run: 'npm run check:deps',
  });
  const f = parseFrontmatter(readFileSync(path.join(root, 'docs/facts/0011-model-pricing-anthropic.md'), 'utf8'));
  const opus = f.data['go-getter'].models.find((m) => m.id === 'claude-opus-5-5');
  assert.equal(opus.cache_read, 0.2);
  assert.equal(opus.min_cache_tokens, 512);
});
