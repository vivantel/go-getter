import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefixRate, stepCost, expectedDelegationCost, expectedStayCost, DEFAULT_FAILURE_RATES } from '../../src/routing/cost.mjs';
import { chooseRoute, escalate, startTier, effortFor, routingClass, TIERS } from '../../src/routing/policy.mjs';

// USD per MTok. Writes cost more than plain input, reads much less (shape of the Anthropic price fact).
const small = { id: 'small-1', provider: 'p', input: 1, cache_write_5m: 1.25, cache_write_1h: 2, cache_read: 0.1, output: 5 };
const medium = { id: 'medium-1', provider: 'p', input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10 };
const large = { id: 'large-1', provider: 'p', input: 4, cache_write_5m: 5, cache_write_1h: 8, cache_read: 0.4, output: 20 };
const plain = { id: 'plain-1', provider: 'p', input: 2, cache_read: 0.2, output: 10 }; // no cache-write price listed
const tiers = { small: ['small-1'], medium: ['medium-1'], large: ['large-1'] };
const approved = { providers: [{ id: 'p' }] };
const policy = {
  classes: {},
  startTiers: { explore: 'small', implement: 'medium', review: 'large' },
  efforts: { explore: 'low', implement: 'medium', review: 'high' },
  maxEscalations: 2,
};
const route = (extra = {}) =>
  chooseRoute({ taskClass: 'explore', dataClass: 'internal', models: [small, medium, large], tiers, registry: approved, policy, step: {}, ...extra });

test('input is priced by cache state: warm reads, cold writes, uncached pays the plain input price', () => {
  assert.equal(prefixRate(medium, { cache: 'warm' }), 0.2);
  assert.equal(prefixRate(medium, { cache: 'cold', ttl: '5m' }), 2.5);
  assert.equal(prefixRate(medium, { cache: 'cold', ttl: '1h' }), 4);
  assert.equal(prefixRate(plain, { cache: 'cold', ttl: '1h' }), 2, 'no write price: writes cost the input price');
  const step = { contextTokens: 100000, newTokens: 0, outputTokens: 0, turns: 1 };
  const cost = (opts) => stepCost(medium, { ...step, ...opts });
  assert.ok(cost({ cache: 'warm' }) < cost({ cache: 'cold', ttl: '5m' }));
  assert.ok(cost({ cache: 'cold', ttl: '5m' }) < cost({ cache: 'cold', ttl: '1h' }));
  assert.ok(cost({ cache: 'warm' }) < cost({ uncached: true }));
  assert.ok(Math.abs(cost({ cache: 'warm' }) - 0.02) < 1e-9, '100k tokens at $0.20 per MTok');
});

test('later calls of a step read the cache the first call wrote', () => {
  const step = { contextTokens: 1e6, newTokens: 0, outputTokens: 0, cache: 'cold', ttl: '5m' };
  const one = stepCost(medium, { ...step, turns: 1 });
  const three = stepCost(medium, { ...step, turns: 3 });
  assert.ok(Math.abs(one - 2.5) < 1e-9);
  assert.ok(Math.abs(three - (2.5 + 2 * 0.2)) < 1e-9);
});

test('output tokens and new input tokens are part of the step cost', () => {
  const base = { contextTokens: 0, turns: 1 };
  assert.ok(Math.abs(stepCost(medium, { ...base, newTokens: 1e6, outputTokens: 0 }) - 2) < 1e-9);
  assert.ok(Math.abs(stepCost(medium, { ...base, newTokens: 0, outputTokens: 1e6 }) - 10) < 1e-9);
});

test('handoff cost: a bigger handoff makes a delegation dearer, and the delegate always starts cold', () => {
  const ladder = [{ model: small, name: 'small', rank: 0 }];
  const at = (handoffTokens) => expectedDelegationCost(small, ladder[0], { ladder, step: { handoffTokens }, escalations: 0 });
  assert.ok(at(200000) > at(2000));
  const warmSession = expectedStayCost(small, ladder[0], { ladder, step: { sessionTokens: 2000 }, escalations: 0 });
  const delegated = at(2000);
  assert.ok(delegated > warmSession, 'same model, same prefix: staying warm is cheaper than starting cold');
});

test('escalation cost: the expected cost adds failure probability times the next tier', () => {
  const ladder = [{ model: small, name: 'small', rank: 0 }, { model: medium, name: 'medium', rank: 1 }, { model: large, name: 'large', rank: 2 }];
  const step = { handoffTokens: 10000 };
  const common = { ladder, step, failureRates: { small: 0.5, medium: 0.25, large: 0 } };
  const base = (m) => stepCost(m, { ...step, contextTokens: 10000, cache: 'cold' });
  assert.ok(Math.abs(expectedDelegationCost(small, ladder[0], { ...common, escalations: 0 }) - base(small)) < 1e-12);
  const one = expectedDelegationCost(small, ladder[0], { ...common, escalations: 1 });
  assert.ok(Math.abs(one - (base(small) + 0.5 * base(medium))) < 1e-12);
  const two = expectedDelegationCost(small, ladder[0], { ...common, escalations: 2 });
  assert.ok(Math.abs(two - (base(small) + 0.5 * (base(medium) + 0.25 * base(large)))) < 1e-12);
  assert.ok(two > one && one > base(small));
  assert.ok(DEFAULT_FAILURE_RATES.small > DEFAULT_FAILURE_RATES.medium && DEFAULT_FAILURE_RATES.medium > DEFAULT_FAILURE_RATES.large);
});

test('a warm-cache larger model beats a cold-cache cheaper one', () => {
  // Same task, same prefix: the session already holds 400k tokens warm on the medium model; the small one would be handed them cold.
  const context = 400000;
  const warmMedium = stepCost(medium, { contextTokens: context, cache: 'warm' });
  const coldSmall = stepCost(small, { contextTokens: context, cache: 'cold', ttl: '5m' });
  assert.ok(medium.input > small.input && medium.output > small.output, 'the larger model is dearer per token');
  assert.ok(warmMedium < coldSmall, `warm medium ${warmMedium} < cold small ${coldSmall}`);

  // And the router agrees: with a big warm session on the medium model it stays rather than delegating to the small one.
  const decided = route({ sessionModel: 'medium-1', step: { sessionTokens: context, handoffTokens: context, cache: 'warm' } });
  assert.equal(decided.action, 'stay');
  assert.equal(decided.model, 'medium-1');
  const delegate = decided.options.find((o) => o.action === 'delegate' && o.model === 'small-1');
  assert.ok(delegate.expectedCost > decided.expectedCost);
});

test('a delegation is rejected when its handoff cost exceeds the saving', () => {
  const session = { sessionModel: 'medium-1', step: { sessionTokens: 20000, cache: 'warm' } };
  // A small brief: the cheaper model's saving is bigger than starting a cold cache, so delegate.
  assert.equal(route({ ...session, step: { ...session.step, handoffTokens: 1000 } }).action, 'delegate');
  assert.equal(route({ ...session, step: { ...session.step, handoffTokens: 1000 } }).model, 'small-1');
  // A huge handoff: the same delegation now costs more than staying put.
  const rejected = route({ ...session, step: { ...session.step, handoffTokens: 600000 } });
  assert.equal(rejected.action, 'stay');
  assert.ok(rejected.options.every((o) => o.action === 'stay' || o.expectedCost > rejected.expectedCost));
});

test('staying is only an option for a session model that is strong enough', () => {
  const decided = route({ taskClass: 'review', sessionModel: 'small-1', step: { sessionTokens: 1000, cache: 'warm', handoffTokens: 1000 } });
  assert.equal(decided.action, 'delegate');
  assert.equal(decided.tier, 'large', 'review starts large; a small session model cannot take it');
});

test('a tie keeps the warm session', () => {
  const same = { ...small, id: 'small-2' };
  const decided = chooseRoute({ taskClass: 'explore', models: [small, same], tiers: { small: ['small-1', 'small-2'] }, registry: approved, policy: { ...policy, startTiers: { explore: 'small' } }, step: { sessionTokens: 0, handoffTokens: 0, cache: 'cold' }, sessionModel: 'small-2' });
  assert.equal(decided.model, 'small-2');
});

test('the cheapest sufficient tier is chosen by class, with the class effort', () => {
  assert.deepEqual([route().tier, route().effort], ['small', 'low']);
  assert.deepEqual([route({ taskClass: 'implement' }).tier, route({ taskClass: 'implement' }).effort], ['medium', 'medium']);
  assert.deepEqual([route({ taskClass: 'review' }).tier, route({ taskClass: 'review' }).effort], ['large', 'high']);
  assert.equal(route({ taskClass: 'unknown' }).action, 'human', 'a class without a policy is not routed');
});

test('an ineligible cheap model is never chosen, however cheap', () => {
  const cheapest = { id: 'bargain', provider: 'unapproved', input: 0.001, cache_read: 0.0001, output: 0.001 };
  const models = [cheapest, small, medium, large];
  const allTiers = { small: ['bargain', 'small-1'], medium: ['medium-1'], large: ['large-1'] };
  for (const dataClass of ['internal', 'confidential']) {
    const decided = route({ models, tiers: allTiers, dataClass });
    assert.notEqual(decided.model, 'bargain', dataClass);
    assert.ok(decided.options.every((o) => o.model !== 'bargain'), `${dataClass}: not even considered`);
  }
  assert.equal(route({ models, tiers: allTiers, dataClass: 'public' }).model, 'bargain', 'public data may go anywhere');
});

test('with no eligible model the step goes to a human, never to an ineligible fallback', () => {
  const none = route({ registry: { providers: [] } });
  assert.equal(none.action, 'human');
  assert.match(none.reason, /no eligible model/);
  assert.equal(none.model, undefined);
  const restricted = route({ dataClass: 'restricted' });
  assert.equal(restricted.action, 'human');
  const local = { id: 'local-1', provider: 'ollama', input: 0, output: 0, local: true };
  assert.equal(route({ dataClass: 'restricted', models: [local, small], tiers: { small: ['local-1', 'small-1'] } }).model, 'local-1');
  // Eligibility comes before cost: a host that runs no approved provider's model has nothing eligible either.
  assert.equal(route({ hostProviders: ['other'] }).action, 'human');
});

test('escalation moves one tier up per failure and stops at the bound with a human', () => {
  const input = { taskClass: 'explore', models: [small, medium, large], tiers, registry: approved, policy, step: {} };
  const first = escalate({ ...input, from: 'small', attempts: 0 });
  assert.deepEqual([first.action, first.tier, first.model, first.attempts], ['delegate', 'medium', 'medium-1', 1]);
  const second = escalate({ ...input, from: first.tier, attempts: first.attempts });
  assert.deepEqual([second.action, second.tier, second.attempts], ['delegate', 'large', 2]);
  const bound = escalate({ ...input, from: second.tier, attempts: second.attempts });
  assert.equal(bound.action, 'human');
  assert.match(bound.reason, /escalation bound of 2/);
});

test('escalation never exceeds the policy bound, whatever the bound is', () => {
  const input = { taskClass: 'explore', models: [small, medium, large], tiers, registry: approved, step: {} };
  for (const maxEscalations of [0, 1, 2, 5]) {
    let from = 'small';
    let attempts = 0;
    let escalations = 0;
    for (let i = 0; i < 20; i++) {
      const next = escalate({ ...input, policy: { ...policy, maxEscalations }, from, attempts });
      if (next.action === 'human') break;
      escalations++;
      ({ tier: from, attempts } = next);
    }
    assert.ok(escalations <= maxEscalations, `bound ${maxEscalations}: ${escalations} escalations`);
    assert.equal(escalate({ ...input, policy: { ...policy, maxEscalations }, from, attempts: Math.max(attempts, maxEscalations) }).action, 'human');
  }
});

test('escalation skips ineligible tiers and hands over when none is stronger', () => {
  const noLarge = escalate({ taskClass: 'explore', models: [small, medium], tiers, registry: approved, policy, step: {}, from: 'medium', attempts: 0 });
  assert.equal(noLarge.action, 'human');
  assert.match(noLarge.reason, /no stronger eligible tier/);
});

test('fast/strong groups start at the strongest member tier and effort', () => {
  const grouped = { ...policy, classes: { explore: 'fast', implement: 'fast', review: 'strong' } };
  assert.equal(routingClass(grouped, 'explore'), 'fast');
  assert.equal(startTier(grouped, 'explore'), 'medium', 'explore shares a group with implement');
  assert.equal(effortFor(grouped, 'explore'), 'medium');
  assert.equal(startTier(grouped, 'review'), 'large');
  assert.equal(startTier(policy, 'explore'), 'small');
  assert.deepEqual(TIERS, ['small', 'medium', 'large']);
});
