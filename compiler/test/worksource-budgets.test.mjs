import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { callSource, cleanText, LIMITS, ok } from '../src/trackers/worksource.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const step = (over = {}) => ({ id: '1', title: 'T', state: 'pending', parallel: false, class: 'implement', needs: [], fields: { Do: 'a body' }, ...over });
const source = (handle, extra = {}) => ({ id: 'double', ops: ['list', 'get', 'setState'], handle, ...extra });

test('an oversized field is cut and counted', async () => {
  const r = await callSource(source(() => ok({ step: step({ title: 'x'.repeat(500), doneWhen: 'y'.repeat(LIMITS.doneWhen + 5) }) })), 'get', { id: '1' });
  assert.equal(r.ok, true);
  assert.equal(r.result.step.title.length, LIMITS.title);
  assert.ok(r.result.step.title.endsWith('…'));
  assert.equal(r.result.step.doneWhen.length, LIMITS.doneWhen);
  assert.equal(r.result.capped, 2);
  assert.equal((await callSource(source(() => ok({ step: step() })), 'get', { id: '1' })).result.capped, undefined);
});

test('an answer over its byte cap is unavailable', async () => {
  const fields = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`F${i}`, 'z'.repeat(LIMITS.field)]));
  const r = await callSource(source(() => ok({ step: step({ fields }) })), 'get', { id: '1' });
  assert.equal(r.error.code, 'unavailable');
  assert.match(r.error.message, /bytes/);
});

test('a list over its cap is unavailable, and plan next and plan status refuse to report on it', (t) => {
  const over = (n) => callSource(source(() => ok({ steps: Array.from({ length: n }, (_, i) => step({ id: String(i + 1) })) })), 'list');
  return over(LIMITS.listItems + 1).then(async (r) => {
    assert.equal(r.error.code, 'unavailable');
    assert.equal((await over(LIMITS.listItems)).ok, true);
    const dir = mkdtempSync(path.join(tmpdir(), 'gg-budget-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
    const body = Array.from({ length: LIMITS.listItems + 1 }, (_, i) => `### ${i + 1} Step ${i + 1} — [ ]\nDone-when: ok.\n`).join('\n');
    writeFileSync(path.join(dir, 'docs/plans/big.md'), `# Big\n\n${body}`);
    for (const sub of ['next', 'status']) {
      const run = spawnSync(process.execPath, [cli, 'plan', sub], { cwd: dir, encoding: 'utf8' });
      assert.equal(run.status, 1, sub);
      assert.match(run.stderr, /over its budget/);
      assert.equal(run.stdout, '');
    }
  });
});

test('list carries the step summary and no bodies; get carries the detail', async () => {
  const full = step({ doneWhen: 'it works', issue: '#5', check: 'npm test', fields: { Do: 'secret plan prose', 'Done-when': 'it works' }, effort: 'high' });
  const s = source((op) => (op === 'list' ? ok({ steps: [full] }) : ok({ step: full })));
  const listed = (await callSource(s, 'list')).result.steps[0];
  assert.deepEqual(Object.keys(listed).sort(), ['class', 'doneWhen', 'id', 'issue', 'needs', 'parallel', 'state', 'title']);
  assert.doesNotMatch(JSON.stringify(listed), /prose/);
  assert.equal((await callSource(s, 'get', { id: '1' })).result.step.fields.Do, 'secret plan prose');
});

test('a secret and an email in a title are masked, and control characters go', async () => {
  const key = `AKIA${'A1B2C3D4E5F6G7H8'}`;
  const r = await callSource(source(() => ok({ steps: [step({ title: `Fix ${key} for bob@example.com\u0007\nnow` })] })), 'list');
  const t = r.result.steps[0].title;
  assert.equal(t, 'Fix [redacted] for [redacted] now');
  assert.deepEqual(cleanText('a\u0000b', 10), { text: 'a b', cut: false });
});

test('a network source read is cached within its limit and cleared by a write; a local source is not cached', async () => {
  let reads = 0;
  const handle = (op) => {
    if (op === 'list') reads++;
    return op === 'setState' ? ok({ step: step({ state: 'done' }) }) : ok({ steps: [step()] });
  };
  let at = 0;
  const opts = { now: () => at, cacheMs: 1000 };
  const net = source(handle, { network: true });
  await callSource(net, 'list', {}, opts);
  await callSource(net, 'list', {}, opts);
  assert.equal(reads, 1, 'second read served from the cache');
  at = 1500;
  await callSource(net, 'list', {}, opts);
  assert.equal(reads, 2, 'a read past the limit reaches the source');
  await callSource(net, 'list', {}, opts);
  assert.equal(reads, 2);
  await callSource(net, 'setState', { id: '1', state: 'done' }, opts);
  await callSource(net, 'list', {}, opts);
  assert.equal(reads, 3, 'a write cleared the cache');
  reads = 0;
  const local = source(handle);
  await callSource(local, 'list', {}, opts);
  await callSource(local, 'list', {}, opts);
  assert.equal(reads, 2);
});

test('plan next output is unchanged for the file, GitHub and Jira sources', async () => {
  const { fileSource } = await import('../src/trackers/file-source.mjs');
  const { githubSource } = await import('../src/trackers/github.mjs');
  const { jiraSource } = await import('../src/trackers/jira.mjs');
  const { nextSteps } = await import('../src/plan.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-budget-'));
  try {
    const file = path.join(dir, 'plan.md');
    writeFileSync(file, '### 1 One — [x]\nDone-when: one.\n\n### 2 Two — [ ]\nClass: review · Needs: 1\nDone-when: two is checked.\nDo: long prose\n\n### 3 Three — [ ] ‖\nDone-when: three.\n');
    const direct = fileSource(file, { name: 'plan.md' });
    const expected = nextSteps({ file: 'plan.md', steps: direct.handle('list', {}).result.steps });
    for (const src of [direct, githubSource(file, { project: dir, name: 'plan.md' }), jiraSource(file, { project: dir, name: 'plan.md' })]) {
      const r = await callSource(src, 'list');
      assert.deepEqual(nextSteps({ file: 'plan.md', steps: r.result.steps }), expected, src.id);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
