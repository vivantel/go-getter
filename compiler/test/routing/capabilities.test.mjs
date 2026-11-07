import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoute, escalate } from '../../src/routing/policy.mjs';

const price = { input: 1, output: 5 };
const models = [
  { id: 'cheap', provider: 'p', ...price, input: 0.1, output: 0.5 },
  { id: 'seer', provider: 'p', ...price, capabilities: ['vision', 'tool-use'] },
];
const route = (capabilities, extra = {}) => chooseRoute({
  taskClass: 'implement', models, tiers: { small: ['cheap'], medium: ['seer'], large: [] }, capabilities, dataClass: 'public',
  policy: { classes: {}, startTiers: { implement: 'small' }, efforts: {}, maxEscalations: 2 }, step: {}, ...extra,
});

test('a model-property tag restricts the router candidates before cost', () => {
  assert.equal(route([]).model, 'cheap');
  const r = route(['vision']);
  assert.equal(r.model, 'seer');
  assert.ok(r.options.every((o) => o.model === 'seer'));
  assert.equal(route(['long-context']).action, 'human');
  const up = escalate({ taskClass: 'implement', models, tiers: { small: ['cheap'], medium: ['seer'], large: [] }, capabilities: ['vision'], dataClass: 'public', from: 'small', attempts: 0, policy: { classes: {}, startTiers: { implement: 'small' }, efforts: {}, maxEscalations: 2 }, step: {} });
  assert.equal(up.model, 'seer');
});

test('governance still comes first', () => {
  const r = route(['vision'], { dataClass: 'restricted' });
  assert.equal(r.action, 'human');
});
