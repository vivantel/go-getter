// The throughput report's edges (roadmap T1, decision 0154): turn classification, gap and median arithmetic, the gh query, and the command's success path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { activity, isHumanTurn, mergedPrs, prStats, readEvents, transcriptFiles } from '../src/metrics/day.mjs';
import metricsCommand from '../src/commands/metrics.mjs';

const turn = (content, extra = {}) => ({ type: 'user', message: { content }, ...extra });
const line = (iso, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: iso, ...extra });

test('isHumanTurn: plain and array text count; wrappers, meta, sidechain, tool results and blanks do not', () => {
  assert.equal(isHumanTurn(turn('do the thing')), true);
  assert.equal(isHumanTurn(turn([{ type: 'text', text: 'do the thing' }])), true);
  assert.equal(isHumanTurn(turn([{ type: 'image' }, { type: 'text', text: 'see this' }])), true);
  for (const wrapped of ['<system-reminder>x', '<task-notification>x', '<command-message>x', '<local-command-stdout>x', '  <command-name>x'])
    assert.equal(isHumanTurn(turn(wrapped)), false, wrapped);
  assert.equal(isHumanTurn(turn('   ')), false);
  assert.equal(isHumanTurn(turn([{ type: 'text', text: '' }])), false);
  assert.equal(isHumanTurn(turn('hi', { isMeta: true })), false);
  assert.equal(isHumanTurn(turn('hi', { isSidechain: true })), false);
  assert.equal(isHumanTurn(turn([{ type: 'tool_result' }, { type: 'text', text: 'hi' }])), false);
  assert.equal(isHumanTurn({ type: 'assistant', message: { content: 'hi' } }), false);
  assert.equal(isHumanTurn(turn(42)), false);
  assert.equal(isHumanTurn(null), false);
});

test('a prompt that merely mentions a wrapper tag mid-text is still a human turn', () => {
  assert.equal(isHumanTurn(turn('please explain <system-reminder> blocks')), true);
});

test('readEvents: UTC day filter, bad timestamps, blank lines and bad JSON are skipped; times come back sorted', () => {
  const text = [
    line('2026-10-31T23:59:59.000Z'),
    '',
    'garbage',
    line('2026-11-01T00:00:00.000Z'),
    line('not a time'),
    JSON.stringify({ type: 'assistant' }),
    line('2026-10-31T00:00:00.000Z'),
  ].join('\n');
  const { times, humanTurns } = readEvents([text], '2026-10-31');
  assert.deepEqual(times, [Date.parse('2026-10-31T00:00:00.000Z'), Date.parse('2026-10-31T23:59:59.000Z')]);
  assert.equal(humanTurns, 0);
});

test('readEvents merges several transcripts and counts a human turn in each', () => {
  const t = (iso) => JSON.stringify({ type: 'user', timestamp: iso, message: { content: 'go' } });
  const r = readEvents([t('2026-10-31T10:00:00Z'), t('2026-10-31T09:00:00Z')], '2026-10-31');
  assert.equal(r.humanTurns, 2);
  assert.ok(r.times[0] < r.times[1]);
});

test('activity: a gap of exactly ten minutes is idle, nine minutes fifty-nine seconds is active', () => {
  const t0 = Date.parse('2026-10-31T10:00:00Z');
  assert.deepEqual(activity([t0, t0 + 10 * 60_000]), { activeMinutes: 0, wallMinutes: 10 });
  assert.deepEqual(activity([t0, t0 + 10 * 60_000 - 1000]), { activeMinutes: 10, wallMinutes: 10 });
});

test('activity: no events and one event are zero', () => {
  assert.deepEqual(activity([]), { activeMinutes: 0, wallMinutes: 0 });
  assert.deepEqual(activity([Date.parse('2026-10-31T10:00:00Z')]), { activeMinutes: 0, wallMinutes: 0 });
});

test('prStats: median of an even count averages the middle pair; an odd count takes the middle', () => {
  const pr = (mins) => ({ additions: 1, deletions: 1, createdAt: '2026-10-31T10:00:00Z', mergedAt: new Date(Date.parse('2026-10-31T10:00:00Z') + mins * 60_000).toISOString() });
  assert.equal(prStats([pr(10), pr(20)], '2026-10-31').medianOpenToMergeMinutes, 15);
  assert.equal(prStats([pr(50), pr(10), pr(20)], '2026-10-31').medianOpenToMergeMinutes, 20);
});

test('prStats: a PR with no counts adds zero, one with no createdAt is left out of the median, a PR merged on another day is not counted', () => {
  const r = prStats(
    [
      { mergedAt: '2026-10-31T10:00:00Z', createdAt: '2026-10-31T09:00:00Z' },
      { mergedAt: '2026-10-31T11:00:00Z', additions: 5, deletions: 2 },
      { mergedAt: '2026-11-01T00:00:01Z', additions: 100, deletions: 100, createdAt: '2026-10-31T09:00:00Z' },
      null,
    ],
    '2026-10-31',
  );
  assert.equal(r.mergedPrs, 2);
  assert.equal(r.linesAdded, 5);
  assert.equal(r.linesRemoved, 2);
  assert.equal(r.medianOpenToMergeMinutes, 60);
});

test('mergedPrs asks gh for merged PRs a day either side of the date, in the project directory', () => {
  let seen;
  const out = mergedPrs('/p', '2026-10-31', { exec: (cmd, args, cwd) => ((seen = { cmd, args, cwd }), '[]') });
  assert.deepEqual(out, []);
  assert.equal(seen.cwd, '/p');
  assert.ok(seen.args.includes('merged:2026-10-30..2026-11-01'));
  assert.ok(seen.args.includes('--json'));
});

test('mergedPrs: non-array JSON is an empty list; bad JSON or a failing gh is null (unavailable)', () => {
  assert.deepEqual(mergedPrs('/p', '2026-10-31', { exec: () => '{"a":1}' }), []);
  assert.equal(mergedPrs('/p', '2026-10-31', { exec: () => 'not json' }), null);
  assert.equal(mergedPrs('/p', '2026-10-31', { exec: () => { throw new Error('x'); } }), null);
});

test('transcriptFiles: no projects directory gives none; only .jsonl files of the project and its worktrees are read', () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-metrics-edge-')));
  try {
    assert.deepEqual(transcriptFiles('/a/b', home), []);
    const slug = '-a-b';
    for (const [dir, file] of [[slug, 'x.jsonl'], [slug, 'notes.txt'], [`${slug}-wt-one`, 'y.jsonl'], [`${slug}-other`, 'z.jsonl']]) {
      mkdirSync(path.join(home, '.claude', 'projects', dir), { recursive: true });
      writeFileSync(path.join(home, '.claude', 'projects', dir, file), '');
    }
    const names = transcriptFiles('/a/b', home).map((f) => path.basename(f)).sort();
    assert.deepEqual(names, ['x.jsonl', 'y.jsonl']);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('the command prints the report as JSON for a project with no transcripts and exits 0', () => {
  const project = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-metrics-cmd-')));
  const log = console.log;
  const printed = [];
  console.log = (s) => printed.push(s);
  try {
    assert.equal(metricsCommand({ args: ['day', '--date', '2020-01-02', '--project', project] }), 0);
  } finally { console.log = log; rmSync(project, { recursive: true, force: true }); }
  const r = JSON.parse(printed.join(''));
  assert.equal(r.date, '2020-01-02');
  assert.equal(r.humanTurns, 0);
  assert.equal(r.activeMinutes, 0);
});

test('the command rejects an impossible calendar date and a flag missing its value', () => {
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(metricsCommand({ args: ['day', '--date', '2026-13-45'] }), 2);
    assert.equal(metricsCommand({ args: ['day', '--date'] }), 2);
    assert.equal(metricsCommand({ args: ['week'] }), 2);
  } finally { console.error = err; }
});
