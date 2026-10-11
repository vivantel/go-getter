import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSource } from '../src/trackers/file-source.mjs';
import { callSource, isPlainData, ok } from '../src/trackers/worksource.mjs';
import { runWorkSourceContract } from './support/worksource-contract.mjs';

const MARK = { pending: ' ', 'in progress': '~', done: 'x', blocked: '!', moved: '>' };

function makeFile(steps) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-worksource-'));
  const file = path.join(dir, 'plan.md');
  const body = steps.map((s) => `### ${s.id} ${s.title} — [${MARK[s.state]}]\nNeeds: ${s.needs.length ? s.needs.join(', ') : 'none'}\nDone-when: ${s.title} done.\n`);
  writeFileSync(file, `# Plan\n\n${body.join('\n')}`);
  return { source: fileSource(file, { name: 'plan.md' }), file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

runWorkSourceContract('file source', makeFile);

test('the file source keeps the plan file readable: only the marker of the step changes', async () => {
  const { source, file, cleanup } = makeFile([{ id: '1', title: 'One', state: 'pending', needs: [] }]);
  try {
    await callSource(source, 'setState', { id: '1', state: 'done' });
    assert.equal(readFileSync(file, 'utf8'), '# Plan\n\n### 1 One — [x]\nNeeds: none\nDone-when: One done.\n');
  } finally {
    cleanup();
  }
});

test('the file source names a plan that does not parse, with its problems', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-worksource-'));
  try {
    const file = path.join(dir, 'plan.md');
    writeFileSync(file, '### 1 One — [x]\nNeeds: 9\n');
    const r = await callSource(fileSource(file, { name: 'p.md' }), 'list', {});
    assert.deepEqual([r.ok, r.error.code], [false, 'invalid-plan']);
    assert.match(r.error.problems[0], /^p\.md:1: step 1 needs unknown step 9/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a source that throws or answers with non-JSON data is unavailable, never an exception', async () => {
  const bad = (handle) => ({ id: 'bad', ops: ['list'], handle });
  assert.equal((await callSource(bad(() => { throw new Error('boom\nmore'); }), 'list')).error.message, 'boom');
  assert.equal((await callSource(bad(() => ok({ at: new Date() })), 'list')).error.code, 'unavailable');
  assert.equal((await callSource(bad(() => ({ ok: false, error: { code: 'nope', message: 'x' } })), 'list')).error.code, 'unavailable');
  assert.equal(isPlainData({ a: [1, 'x', null, { b: true }] }), true);
  assert.equal(isPlainData({ a: undefined }), false);
});

test('an answer of the wrong shape is unavailable', async () => {
  const step = { id: '1', title: 'T', state: 'done', parallel: false, class: 'implement', needs: [], fields: {} };
  const answering = (op, result) => ({ id: 'bad', ops: [op], handle: () => ({ ok: true, ...(result === undefined ? {} : { result }) }) });
  for (const [op, result] of [['list', undefined], ['list', { steps: [{ ...step, needs: undefined }] }], ['list', { steps: [{ ...step, state: 'finished' }] }], ['get', { step: { ...step, title: 7 } }], ['get', {}]]) {
    assert.equal((await callSource(answering(op, result), op, op === 'list' ? {} : { id: '1' })).error?.code, 'unavailable', `${op} ${JSON.stringify(result)}`);
  }
  assert.equal((await callSource(answering('list', { steps: [step] }), 'list')).ok, true);
});
