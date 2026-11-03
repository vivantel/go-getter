import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateArgs } from '../src/gate.mjs';

test('go-getter pr and ship are gated with the outward class unless their parts are freed (pr: push and pr-create; ship: and pr-merge)', () => {
  assert.deepEqual(gateArgs({ classes: 'irreversible,outward' }).goGetter, ['pr', 'ship']);
  assert.deepEqual(gateArgs({ classes: 'outward', 'go-getter': 'plan issue create' }).goGetter, ['plan issue create', 'pr', 'ship']);
  assert.deepEqual(gateArgs({ classes: 'irreversible' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: '""' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,pr-create' }).goGetter, ['ship'], 'pr is free, only the merge still stops ship');
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,pr-create,pr-merge' }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,gh-pr,' }).goGetter, []);
});

test('go-getter pr and ship are not gated when each part is freed or grantable (decision 0159)', () => {
  const grants = 'git-push,pr-create,pr-merge,pr-close';
  assert.deepEqual(gateArgs({ classes: 'irreversible,outward', grantable: grants }).goGetter, []);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push', grantable: 'pr-create,pr-merge' }).goGetter, []);
});

test('go-getter ship is still gated when a part is neither freed nor grantable', () => {
  assert.deepEqual(gateArgs({ classes: 'outward', grantable: 'git-push,pr-create,pr-close' }).goGetter, ['ship']);
  assert.deepEqual(gateArgs({ classes: 'outward', free: 'git-push,pr-create', grantable: 'pr-close' }).goGetter, ['ship']);
});
