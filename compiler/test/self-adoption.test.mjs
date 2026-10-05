import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unadoptedPacks } from '../src/checks/self-adoption.mjs';

const art = (by, status = 'active') => ({ data: { status, 'go-getter': { 'generated-by': by } } });

test('a pack counts as adopted only for its exact version and an active artifact', () => {
  const packs = [{ id: 'context', version: '0.1.0' }, { id: 'governance', version: '0.2.0' }];
  assert.deepEqual(unadoptedPacks(packs, [art('context@0.1.0'), art('governance@0.1.0')]), ['governance@0.2.0']);
  assert.deepEqual(unadoptedPacks(packs, [art('context@0.1.0', 'superseded'), art('governance@0.2.0')]), ['context@0.1.0']);
  assert.deepEqual(unadoptedPacks([], []), []);
});
