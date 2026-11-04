// Plan discovery-and-outcomes D7a (decision 0177 item 3): `go-getter operation check` refuses an incomplete charter by field;
// `operation status` lists the crossed health thresholds from readings and creates no unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { operationProblems, operationStatus } from '../src/operation.mjs';
import { recordReading } from '../src/measure.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'compiler/bin/go-getter.mjs');

const METER = (id) => `---\nid: ${id}\ntitle: ${id}\nreads: x\nsource: y\ncapabilities: []\nrefresh: 1d\ncost: 0\nnoise: low\nowner: ops\ndata-class: public\nretention: 90d\n---\n`;
const FULL = `id: shop-live
title: Shop live
status: active
outcome: faster-checkout
owner: alice
health:
  - meter: error-rate
    threshold: 5
    direction: above
  - meter: uptime
    threshold: 99
    direction: below
  - meter: queue-depth
    threshold: 100
    direction: above
escalation: [alice, bob, cto]
retirement: "the shop is shut down"`;

function project(frontmatter = FULL, meters = ['error-rate', 'uptime', 'queue-depth']) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-operation-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(path.join(dir, 'docs/operations'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/meters'), { recursive: true });
  for (const m of meters) writeFileSync(path.join(dir, 'docs/meters', `${m}.md`), METER(m));
  writeFileSync(path.join(dir, 'docs/operations/shop-live.md'), `---\n${frontmatter}\n---\n\nRuns the shop.\n`);
  return dir;
}
const without = (key) => FULL.split('\n').filter((l, i, a) => {
  if (l.startsWith(`${key}:`)) return false;
  if (key === 'health') return !(/^\s/.test(l) && a.slice(0, i).reverse().find((x) => !/^\s/.test(x))?.startsWith('health:'));
  return true;
}).join('\n');
const cli = (dir, ...args) => spawnSync(process.execPath, [bin, 'operation', ...args], { cwd: dir, encoding: 'utf8' });
const clean = (dir) => rmSync(dir, { recursive: true, force: true });

test('a complete charter passes', () => {
  const dir = project();
  try {
    assert.deepEqual(operationProblems(dir), []);
    const r = cli(dir, 'check', 'shop-live');
    assert.equal(r.status, 0, r.stderr);
  } finally { clean(dir); }
});

for (const [key, named] of [['owner', 'owner'], ['health', 'health meter'], ['retirement', 'retirement condition'], ['outcome', 'outcome'], ['escalation', 'escalation']]) {
  test(`a charter missing its ${key} is refused by name`, () => {
    const dir = project(without(key));
    try {
      const problems = operationProblems(dir, 'shop-live');
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.match(problems[0], new RegExp(`missing ${named}\\b`));
      const r = cli(dir, 'check');
      assert.equal(r.status, 1);
      assert.match(r.stderr, new RegExp(`missing ${named}\\b`));
    } finally { clean(dir); }
  });
}

test('a health meter that does not exist is refused', () => {
  const dir = project(FULL, ['error-rate', 'uptime']);
  try {
    const problems = operationProblems(dir);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /unknown meter "queue-depth"/);
  } finally { clean(dir); }
});

test('a threshold without a direction is refused', () => {
  const dir = project(FULL.replace('direction: above\n  - meter: uptime', 'direction: sideways\n  - meter: uptime'));
  try {
    assert.match(operationProblems(dir).join('\n'), /"error-rate" needs a direction/);
  } finally { clean(dir); }
});

test('unreadable frontmatter is refused by name, not a crash', () => {
  const dir = project('id: [unclosed\n  bad: : :');
  try {
    const r = cli(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /shop-live\.md: unreadable frontmatter/);
    assert.doesNotMatch(r.stderr, /at .*\.mjs/);
    assert.equal(cli(dir, 'status').status, 0);
  } finally { clean(dir); }
});

test('status lists exactly the crossed thresholds and creates no unit', () => {
  const dir = project();
  try {
    const t = (n) => new Date(Date.UTC(2026, 10, 4, 10, n));
    const put = (m, v, n) => assert.ok(recordReading(dir, m, { value: v, reader: 't', now: t(n), remote: null }).ok);
    put('error-rate', 1, 0); put('error-rate', 9, 1);   // latest 9 > 5: crossed
    put('uptime', 99.5, 0);                              // 99.5 not below 99: ok
    // queue-depth has no reading
    const rows = operationStatus(dir);
    assert.deepEqual(rows.filter((r) => r.state === 'crossed').map((r) => r.meter), ['error-rate']);
    assert.equal(rows.find((r) => r.meter === 'uptime').state, 'ok');
    assert.equal(rows.find((r) => r.meter === 'queue-depth').state, 'no-reading');
    put('uptime', 98, 5);                                // latest 98 < 99: crossed
    const before = readdirSync(dir, { recursive: true }).sort();
    const r = cli(dir, 'status');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /shop-live: error-rate crossed \(9 above 5\); owner alice; escalate alice > bob > cto/);
    assert.match(r.stdout, /shop-live: uptime crossed \(98 below 99\)/);
    assert.match(r.stdout, /queue-depth has no reading/);
    assert.match(r.stdout, /2 thresholds crossed/);
    assert.deepEqual(readdirSync(dir, { recursive: true }).sort(), before, 'status writes no file or unit');
    assert.equal(existsSync(path.join(dir, 'docs/units')), false);
  } finally { clean(dir); }
});
