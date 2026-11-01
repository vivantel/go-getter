import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateArgs } from '../src/gate.mjs';

test('go-getter ship is gated with the outward class unless push, pr-create and pr-merge are all freed', () => {
  assert.deepEqual(gateArgs({ classes: 'irreversible,outward' }).goGetter, ['ship']);
  assert.deepEqual(gateArgs({ classes: 'outward', 'go-getter': 'plan issue create' }).goGetter, ['plan issue create', 'ship']);
  assert.deepEqual(gateArgs({ classes: 'irreversible' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: '""' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,pr-create' }).goGetter, ['ship']);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,pr-create,pr-merge' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,gh-pr,' }).goGetter, []);
});
