import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlap, scopeToken, scopeTokens, scopesOverlap } from '../src/work/scope.mjs';

test('tokens are normalized and named resources keep their kind', () => {
  assert.equal(scopeToken('`./src/a/`'), 'src/a/**');
  assert.equal(scopeToken('interface: api'), 'interface:api');
  assert.equal(scopeToken('  '), null);
  assert.deepEqual(scopeTokens(['b', 'a', 'a', '']), ['a', 'b']);
});

test('paths overlap when one contains the other', () => {
  assert.equal(scopesOverlap(['src/a'], ['src/a/b.mjs']), true);
  assert.equal(scopesOverlap(['src/a/b.mjs'], ['src/a']), true);
  assert.equal(scopesOverlap(['src/a'], ['src/ab']), false);
  assert.equal(scopesOverlap(['docs/x.md'], ['docs/y.md']), false);
});

test('a glob overlaps what it can match and what contains its fixed directory', () => {
  assert.equal(scopesOverlap(['src/**'], ['src/a/b.mjs']), true);
  assert.equal(scopesOverlap(['src/*'], ['src/a/b.mjs']), true, 'it matches the directory src/a');
  assert.equal(scopesOverlap(['src/*.mjs'], ['src/a/b.mjs']), false);
  assert.equal(scopesOverlap(['src/*.mjs'], ['src/b.mjs']), true);
  assert.equal(scopesOverlap(['src/a'], ['src/a/**/*.test.mjs']), true);
  assert.equal(scopesOverlap(['src/a/**'], ['src/b/**']), false);
  assert.equal(scopesOverlap(['src/**'], ['src/b/**']), true);
  assert.equal(scopesOverlap(['**/*.md'], ['docs/x.md']), true);
});

test('a directory without a trailing slash overlaps a glob that reaches into it', () => {
  assert.equal(scopesOverlap(['src/a'], ['src/**/*.test.mjs']), true);
  assert.equal(scopesOverlap(['docs'], ['**/*.mjs']), true);
  assert.equal(scopesOverlap(['src/a/b'], ['src/*/b/*.mjs']), true);
  assert.equal(scopesOverlap(['src/a'], ['lib/**/*.mjs']), false);
  assert.equal(scopesOverlap(['src/a'], ['src/b/*.mjs']), false);
});

test('brace and bracket globs match what they spell', () => {
  assert.equal(scopesOverlap(['src/{a,b}.mjs'], ['src/a.mjs']), true);
  assert.equal(scopesOverlap(['src/{a,b}.mjs'], ['src/c.mjs']), false);
  assert.equal(scopesOverlap(['src/[ab].mjs'], ['src/b.mjs']), true);
  assert.equal(scopesOverlap(['src/[ab].mjs'], ['src/c.mjs']), false);
  assert.equal(scopesOverlap(['src/[!a].mjs'], ['src/a.mjs']), false);
});

test('named resources overlap only when they are the same resource', () => {
  assert.deepEqual(overlap(['interface:api', 'src/a'], ['tag:billing', 'interface:api']), ['interface:api', 'interface:api']);
  assert.equal(scopesOverlap(['tag:billing'], ['tag:billing']), true);
  assert.equal(scopesOverlap(['tag:billing'], ['artifact:billing']), false);
  assert.equal(scopesOverlap(['tag:billing'], ['tag:billing/**']), false);
  assert.equal(scopesOverlap([], ['src/a']), false);
});
