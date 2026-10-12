// The OpenCode and Kilo session reader (step 5 of docs/plans/archive/run-spend.md, fact 0037), with a stub for the host command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordSessionSpend } from '../src/spend/sessions.mjs';
import { recordRunSpend } from '../src/spend/index.mjs';
import { readLog } from '../src/telemetry/record.mjs';

const decision = `---\nid: 0001-t\ntitle: t\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\nx\n`;
const fact = `---\nid: 0011-p\ntitle: p\nstatus: active\ndate: 2026-10-05\ntags: [cost]\ngo-getter:\n  models:\n    - {id: m-one, provider: acme, input: 2, cache_read: 0.2, output: 10}\n---\n\nx\n`;
const T0 = Date.parse('2026-10-12T10:00:00.000Z');
const msg = (id, model, cost, tokens, completed, created = completed - 1000) => ({ info: { id, role: 'assistant', modelID: model, cost, tokens, time: { created, completed } } });

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-sess-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/decisions/0001-t.md'), decision);
  writeFileSync(path.join(dir, 'docs/facts/0011-p.md'), fact);
  return { dir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const stub = (dir, sessions, exported) => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'session') return JSON.stringify(sessions.map((s) => ({ id: s.id, updated: s.updated, directory: s.directory ?? dir })));
    return `Exporting session\n${JSON.stringify({ info: {}, messages: exported[args[1]] })}`;
  };
  return { exec, calls };
};

test('the host-reported cost is summed, the difference is recorded once, and a later read counts only new messages', () => {
  const s = setup();
  try {
    const msgs = [msg('a', 'm-one', 0.5, { input: 10, output: 5, reasoning: 5, cache: { read: 100, write: 0 } }, T0 + 1000), msg('b', 'm-one', 0.25, { input: 1, output: 1, cache: { read: 0, write: 0 } }, T0 + 2000)];
    const { exec } = stub(s.dir, [{ id: 'ses_1', updated: T0 + 3000 }], { ses_1: msgs });
    assert.equal(recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec }).records, 1);
    const [r] = readLog(s.dir);
    assert.equal(r.cost, 0.75);
    assert.deepEqual(r.tokens, { input: 11, cacheRead: 100, cacheWrite: 0, output: 11 });
    assert.equal(recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec }).records, 0);
    msgs.push(msg('c', 'm-one', 0.1, { input: 1, output: 1 }, T0 + 4000));
    recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec });
    assert.equal(readLog(s.dir).at(-1).cost, 0.1);
  } finally { s.cleanup(); }
});

test('a zero reported cost is priced from tokens when the model has a price row, else tokens only', () => {
  const s = setup();
  try {
    const { exec } = stub(s.dir, [{ id: 'ses_1', updated: T0 + 3000 }], { ses_1: [msg('a', 'm-one', 0, { input: 1000000, output: 100000 }, T0 + 1000), msg('b', 'free-model', 0, { input: 5, output: 5 }, T0 + 2000)] });
    recordSessionSpend(s.dir, 'kilo', new Date(T0).toISOString(), { exec });
    const log = readLog(s.dir);
    assert.equal(log.find((r) => r.model === 'm-one').cost, 3);
    assert.equal(log.find((r) => r.model === 'free-model').cost, undefined);
  } finally { s.cleanup(); }
});

test('sessions of other projects, sessions not touched since the run began, and messages before it are left out', () => {
  const s = setup();
  try {
    const { exec, calls } = stub(s.dir, [{ id: 'other', updated: T0 + 3000, directory: '/somewhere/else' }, { id: 'old', updated: T0 - 5000 }, { id: 'ses_1', updated: T0 + 3000 }], {
      ses_1: [msg('early', 'm-one', 9, { input: 1 }, T0 - 500, T0 - 1000), msg('a', 'm-one', 1, { input: 1 }, T0 + 1000)],
    });
    recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec });
    assert.equal(readLog(s.dir)[0].cost, 1);
    assert.deepEqual(calls.filter((c) => c[1] === 'export').map((c) => c[2]), ['ses_1']);
  } finally { s.cleanup(); }
});

test('a missing command or unreadable output records nothing and does not throw; hosts without sessions are skipped', () => {
  const s = setup();
  try {
    const boom = () => { throw new Error('ENOENT'); };
    assert.deepEqual(recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec: boom }), { records: 0, sessions: 0 });
    assert.deepEqual(recordSessionSpend(s.dir, 'opencode', new Date(T0).toISOString(), { exec: () => 'garbage' }), { records: 0, sessions: 0 });
    assert.deepEqual(recordSessionSpend(s.dir, 'cursor', new Date(T0).toISOString(), { exec: boom }), { records: 0, sessions: 0 });
    mkdirSync(path.join(s.dir, '.opencode'));
    recordRunSpend(s.dir, { startedAt: new Date(T0).toISOString() }, { opencode: { telemetry: { spendSource: 'sessions' } } }, boom);
    assert.deepEqual(readLog(s.dir), []);
  } finally { s.cleanup(); }
});
