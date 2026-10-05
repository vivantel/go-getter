import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_CLASSES, eligibleModels, eligibility } from '../../src/routing/eligibility.mjs';

const models = [
  { id: 'cheap-unapproved', provider: 'other' },
  { id: 'cloud-a', provider: 'a' },
  { id: 'cloud-b', provider: 'b' },
  { id: 'local-1', provider: 'ollama', local: true },
];
const ids = (list) => list.map((m) => m.id);
const approved = { providers: [{ id: 'a', zdr: true }, { id: 'b', zdr: false }] };

test('public data may go to any model, internal only to approved or local ones', () => {
  assert.deepEqual(ids(eligibleModels({ dataClass: 'public', models, registry: approved })), ['cheap-unapproved', 'cloud-a', 'cloud-b', 'local-1']);
  assert.deepEqual(ids(eligibleModels({ dataClass: 'internal', models, registry: approved })), ['cloud-a', 'cloud-b', 'local-1']);
});

test('an ineligible model is never returned, however cheap it is listed', () => {
  // The unapproved provider comes first and is the cheapest by any ordering; it must still be filtered out.
  for (const dataClass of ['internal', 'confidential', 'restricted']) {
    for (const registry of [approved, { providers: [] }, { providers: [{ id: 'a' }], confidential: { enabled: true, requiresZdr: true } }]) {
      assert.ok(!ids(eligibleModels({ dataClass, models, registry })).includes('cheap-unapproved'), `${dataClass} must not reach the unapproved provider`);
    }
  }
});

test('restricted data reaches local models only', () => {
  assert.deepEqual(ids(eligibleModels({ dataClass: 'restricted', models, registry: approved })), ['local-1']);
});

test('confidential data follows the zero-data-retention requirement', () => {
  const open = { ...approved, confidential: { enabled: true, requiresZdr: false } };
  const zdr = { ...approved, confidential: { enabled: true, requiresZdr: true } };
  assert.deepEqual(ids(eligibleModels({ dataClass: 'confidential', models, registry: open })), ['cloud-a', 'cloud-b', 'local-1']);
  assert.deepEqual(ids(eligibleModels({ dataClass: 'confidential', models, registry: zdr })), ['cloud-a', 'local-1']);
});

test('without a confidential class, confidential data is handled as restricted', () => {
  const none = { ...approved, confidential: { enabled: false } };
  assert.deepEqual(ids(eligibleModels({ dataClass: 'confidential', models, registry: none })), ['local-1']);
});

test('local-only policy leaves no cloud model for internal data', () => {
  assert.deepEqual(ids(eligibleModels({ dataClass: 'internal', models, registry: { providers: [] } })), ['local-1']);
});

test('an empty eligible set goes to a human, never to a fallback model', () => {
  const cloudOnly = models.filter((m) => !m.local);
  const result = eligibility({ dataClass: 'restricted', models: cloudOnly, registry: approved });
  assert.deepEqual(result, { models: [], human: true });
  assert.equal(eligibility({ dataClass: 'internal', models, registry: approved }).human, false);
});

test('an unknown data class and a missing registry fail closed', () => {
  assert.deepEqual(eligibleModels({ dataClass: 'secret', models, registry: approved }), []);
  assert.deepEqual(ids(eligibleModels({ dataClass: 'internal', models })), ['local-1']);
  assert.deepEqual(DATA_CLASSES, ['public', 'internal', 'confidential', 'restricted']);
});
