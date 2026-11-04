import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { defineMeter, recordReading, series, due, expire, meterFindings, parseDuration } from '../src/measure.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const env = cleanGitEnv(process.env);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const meterText = (id, extra = {}) => {
  const f = { id, title: `Meter ${id}`, status: 'active', reads: 'weekly signups', source: 'command: ./count.sh', capabilities: '[shell]', refresh: '1d', cost: 2, noise: 'plus or minus 3', owner: 'ana', 'data-class': 'internal', retention: '90d', ...extra };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\nReads ${id}.\n`;
};

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-measure-'));
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}
const write = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};
const define = (dir, id, extra) => {
  const f = path.join(dir, `${id}.draft`);
  writeFileSync(f, meterText(id, extra));
  return defineMeter(dir, f);
};
const at = (s) => new Date(s);

test('a meter is defined from a file into docs/meters with an index row', () => {
  const dir = project();
  const r = define(dir, 'signups');
  assert.deepEqual([r.ok, r.file], [true, 'docs/meters/signups.md']);
  assert.match(readFileSync(path.join(dir, 'docs/meters/INDEX.md'), 'utf8'), /^signups,"Meter signups"/m);
  const bad = define(dir, 'broken', { refresh: 'often' });
  assert.equal(bad.ok, false);
  assert.match(bad.problems.join(), /refresh/);
});

test('define refuses a retention shorter than the window of an outcome that uses the meter', () => {
  const dir = project();
  write(dir, 'docs/outcomes/grow.md', '---\nid: grow\nmeters: [signups]\nwindow: 12w\nbudget: 5\n---\n');
  const r = define(dir, 'signups', { retention: '30d' });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /shorter than the window/);
});

test('readings are recorded in a local ref, read back as a series, and rotate by month', () => {
  const dir = project();
  define(dir, 'signups');
  const a = recordReading(dir, 'signups', { value: 10, reader: 'ana', now: at('2026-10-30T10:00:00Z') });
  assert.equal(a.ok, true);
  assert.equal(a.stored, 'local');
  assert.match(a.note, /no remote/);
  recordReading(dir, 'signups', { value: 20, reader: 'bo', now: at('2026-11-02T10:00:00Z') });
  recordReading(dir, 'signups', { value: 30, reader: 'bo', now: at('2026-11-03T10:00:00Z') });
  assert.match(git(dir, 'for-each-ref', '--format=%(refname)', 'refs/go-getter/readings/'), /signups\/2026-10\n.*signups\/2026-11/s);
  assert.equal(git(dir, 'rev-list', '--count', 'refs/go-getter/readings/signups/2026-11'), '2');
  const s = series(dir, 'signups');
  assert.equal(s.aggregate.count, 3);
  assert.deepEqual([s.aggregate.min, s.aggregate.max, s.aggregate.mean, s.aggregate.latest], [10, 30, 20, 30]);
  assert.deepEqual(s.aggregate.periods, { '2026-10': 1, '2026-11': 2 });
});

test('a stored reading holds only meter, time, value and reader, and private content is refused', () => {
  const dir = project();
  define(dir, 'signups');
  assert.equal(recordReading(dir, 'signups', { value: 5, reader: 'ana', now: at('2026-11-02T10:00:00Z') }).ok, true);
  const blob = git(dir, 'cat-file', 'blob', 'refs/go-getter/readings/signups/2026-11:readings.jsonl');
  assert.deepEqual(Object.keys(JSON.parse(blob)).sort(), ['meter', 'reader', 'time', 'value']);
  const refuse = (opts) => recordReading(dir, 'signups', { now: at('2026-11-02T11:00:00Z'), reader: 'ana', ...opts });
  assert.match(refuse({ value: 'the customer said she is unhappy with her order' }).problem, /free text/);
  assert.match(refuse({ reader: 'bob@example.com', value: 1 }).problem, /email/);
  assert.match(refuse({ value: 'ghp_' + 'a1'.repeat(20) }).problem, /free text|github/);
  assert.match(refuse({ reader: 'token=Abcdefghij1234567890xyz', value: 1 }).problem, /assignment/);
  assert.equal(git(dir, 'rev-list', '--count', 'refs/go-getter/readings/signups/2026-11'), '1');
});

test('a confidential meter is not stored in a ref in a public repository', () => {
  const dir = project();
  define(dir, 'salary', { 'data-class': 'confidential' });
  const pub = recordReading(dir, 'salary', { value: 1, reader: 'ana', visibilityOf: 'public' });
  assert.equal(pub.ok, false);
  assert.match(pub.problem, /public/);
  assert.equal(git(dir, 'for-each-ref', 'refs/go-getter/readings/'), '');
  assert.equal(recordReading(dir, 'salary', { value: 1, reader: 'ana', visibilityOf: 'private' }).ok, true);
});

test('due lists exactly the overdue meters and the measure unit for each', () => {
  const dir = project();
  define(dir, 'daily', { refresh: '1d' });
  define(dir, 'weekly', { refresh: '7d' });
  define(dir, 'never', { refresh: '7d', capabilities: '[survey, phone]' });
  recordReading(dir, 'daily', { value: 1, reader: 'a', now: at('2026-11-01T00:00:00Z') });
  recordReading(dir, 'weekly', { value: 1, reader: 'a', now: at('2026-11-01T00:00:00Z') });
  const d = due(dir, { now: at('2026-11-03T00:00:00Z') });
  assert.deepEqual(d.map((x) => x.meter), ['daily', 'never']);
  assert.deepEqual(d[1].unit.capabilities, ['survey', 'phone']);
  assert.equal(d[1].unit.kind, 'measure');
  assert.match(d[1].unit.accept, /measure read never/);
});

test('expire removes only periods older than the retention', () => {
  const dir = project();
  define(dir, 'signups', { retention: '30d' });
  recordReading(dir, 'signups', { value: 1, reader: 'a', now: at('2026-08-10T00:00:00Z') });
  recordReading(dir, 'signups', { value: 2, reader: 'a', now: at('2026-10-10T00:00:00Z') });
  const removed = expire(dir, { now: at('2026-11-04T00:00:00Z') });
  assert.deepEqual(removed, ['refs/go-getter/readings/signups/2026-08']);
  assert.equal(series(dir, 'signups').aggregate.count, 1);
});

test('readings reach a remote by fast-forward and another clone reads them (local bare repo)', () => {
  const dir = project();
  const bare = mkdtempSync(path.join(tmpdir(), 'gg-measure-remote-'));
  git(bare, 'init', '-q', '--bare');
  git(dir, 'remote', 'add', 'origin', bare);
  define(dir, 'signups');
  const r = recordReading(dir, 'signups', { value: 7, reader: 'a', now: at('2026-11-02T00:00:00Z') });
  assert.equal(r.stored, 'origin');
  assert.equal(recordReading(dir, 'signups', { value: 8, reader: 'b', now: at('2026-11-03T00:00:00Z') }).ok, true);
  const other = mkdtempSync(path.join(tmpdir(), 'gg-measure-clone-'));
  git(other, 'init', '-q', '-b', 'main');
  git(other, 'remote', 'add', 'origin', bare);
  write(other, 'docs/meters/signups.md', meterText('signups'));
  assert.equal(series(other, 'signups').aggregate.count, 2);
  assert.match(git(bare, 'for-each-ref', '--format=%(refname)'), /readings\/signups\/2026-11/);
});

test('lint finds a meter used by no outcome and a cost above the budget; no outcomes directory means none use it', () => {
  const dir = project();
  define(dir, 'signups', { cost: 9 });
  define(dir, 'idle');
  assert.deepEqual(meterFindings(dir).map((f) => f.replace(/^.*: /, '')), ['meter "idle" is used by no outcome', 'meter "signups" is used by no outcome']);
  write(dir, 'docs/outcomes/grow.md', '---\nid: grow\nmeters: [signups]\nbudget: 5\n---\n');
  const f = meterFindings(dir);
  assert.equal(f.length, 2);
  assert.match(f[0], /"idle" is used by no outcome/);
  assert.match(f[1], /cost per reading 9 exceeds the budget 5 of outcome grow/);
});

test('the CLI defines, reads, summarises and lists due meters; check meters reports the unused one', () => {
  const dir = project();
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' });
  const f = path.join(dir, 'm.draft');
  writeFileSync(f, meterText('signups'));
  assert.equal(run('measure', 'define', f).status, 0);
  const read = run('measure', 'read', 'signups', '--value', '12', '--reader', 'ana');
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /local ref only/);
  assert.match(run('measure', 'series', 'signups').stdout, /1 readings/);
  assert.match(run('measure', 'due', '--now', '2030-01-01T00:00:00Z').stdout, /signups: due/);
  const check = run('check', 'meters');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /used by no outcome/);
  assert.equal(run('measure').status, 2);
  assert.equal(parseDuration('3mo'), 90 * 24 * 3600e3);
  assert.ok(existsSync(path.join(dir, 'docs/meters/signups.md')));
});
