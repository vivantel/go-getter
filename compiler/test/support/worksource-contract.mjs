// The cases every WorkSource passes (decisions 0117 and 0119). `make(steps)` returns { source, cleanup? } holding
// those steps, each `{ id, title, state, needs }`; the suite drives the source only through callSource and checks that
// every request and answer is plain data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callSource, isPlainData, OPS, STATES } from '../../src/trackers/worksource.mjs';

const SEED = [
  { id: '1', title: 'First', state: 'done', needs: [] },
  { id: '2', title: 'Second', state: 'pending', needs: ['1'] },
  { id: '3', title: 'Third', state: 'in progress', needs: [] },
];

export function runWorkSourceContract(name, make) {
  const withSource = async (fn) => {
    const made = make(SEED);
    try {
      return await fn(made.source);
    } finally {
      made.cleanup?.();
    }
  };
  const roundTrips = (value) => assert.ok(isPlainData(value), `not plain data: ${JSON.stringify(value)}`);
  const call = async (source, op, args) => {
    roundTrips({ op, args });
    const answer = await callSource(source, op, args);
    roundTrips(answer);
    return answer;
  };

  test(`${name}: list returns every step in order with its state and needs`, () =>
    withSource(async (source) => {
      const r = await call(source, 'list', {});
      assert.equal(r.ok, true);
      assert.deepEqual(r.result.steps.map((s) => [s.id, s.title, s.state, s.needs]), SEED.map((s) => [s.id, s.title, s.state, s.needs]));
      for (const s of r.result.steps) assert.ok(STATES.includes(s.state));
    }));

  test(`${name}: get returns one step and an unknown id is unknown-step`, () =>
    withSource(async (source) => {
      assert.equal((await call(source, 'get', { id: '2' })).result.step.title, 'Second');
      const missing = await call(source, 'get', { id: '99' });
      assert.deepEqual([missing.ok, missing.error.code], [false, 'unknown-step']);
    }));

  test(`${name}: setState changes what get and list report`, () =>
    withSource(async (source) => {
      const r = await call(source, 'setState', { id: '2', state: 'in progress' });
      assert.equal(r.result.step.state, 'in progress');
      assert.equal((await call(source, 'get', { id: '2' })).result.step.state, 'in progress');
      assert.equal((await call(source, 'list', {})).result.steps[1].state, 'in progress');
    }));

  test(`${name}: setState refuses an unknown state or step`, () =>
    withSource(async (source) => {
      assert.equal((await call(source, 'setState', { id: '2', state: 'finished' })).error.code, 'invalid-args');
      assert.equal((await call(source, 'setState', { id: '99', state: 'done' })).error.code, 'unknown-step');
    }));

  test(`${name}: create adds a pending step that list then shows last`, () =>
    withSource(async (source) => {
      if (!source.ops.includes('create')) return;
      const r = await call(source, 'create', { id: '4', title: 'Fourth', needs: ['2'] });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.deepEqual([r.result.step.state, r.result.step.needs], ['pending', ['2']]);
      assert.equal((await call(source, 'list', {})).result.steps.at(-1).id, '4');
      assert.equal((await call(source, 'create', { id: '5', title: 'Bad', needs: ['nope'] })).error.code, 'invalid-args');
    }));

  test(`${name}: an op the source does not list is unsupported, one it lists works`, () =>
    withSource(async (source) => {
      for (const op of OPS) {
        if (source.ops.includes(op)) continue;
        assert.equal((await call(source, op, { id: '1', text: 'x', title: 't', state: 'done' })).error.code, 'unsupported', op);
      }
      assert.equal((await call(source, 'frobnicate', {})).error.code, 'unknown-op');
    }));

  test(`${name}: arguments that are not plain data are refused`, () =>
    withSource(async (source) => {
      const r = await callSource(source, 'get', { id: () => '1' });
      assert.equal(r.error.code, 'invalid-args');
      assert.equal((await callSource(source, 'get', { id: undefined })).error.code, 'invalid-args');
    }));
}
