// The throughput report (roadmap T1, decision 0154): exact figures from fixture transcripts and PR JSON, and no prompt text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReport, dayReport, transcriptFiles } from '../src/metrics/day.mjs';
import metricsCommand from '../src/commands/metrics.mjs';

const at = (hhmm, day = '2026-10-31') => `${day}T${hhmm}:00.000Z`;
const user = (t, content, extra = {}) => JSON.stringify({ type: 'user', timestamp: at(t), message: { role: 'user', content }, ...extra });
const assistant = (t) => JSON.stringify({ type: 'assistant', timestamp: at(t), message: { role: 'assistant', content: [{ type: 'text', text: 'SECRET REPLY' }] } });
const result = (t) => user(t, [{ type: 'tool_result', content: 'SECRET OUTPUT' }]);

const session = [
  user('10:00', 'SECRET PROMPT one'),
  assistant('10:03'),
  result('10:04'),
  user('10:05', [{ type: 'text', text: 'SECRET PROMPT two' }]),
  assistant('10:08'),
  user('10:09', '<local-command-caveat>x</local-command-caveat>', { isMeta: true }),
  user('10:09', '<command-name>/clear</command-name>'),
  // 40 minute gap: wall time, not active time
  user('10:49', 'SECRET PROMPT three'),
  assistant('10:52'),
  user('10:50', 'subagent prompt', { isSidechain: true }),
  user('09:00', 'SECRET other day', {}).replace('2026-10-31', '2026-10-30'),
  'not json',
].join('\n');

const prs = [
  { number: 1, additions: 100, deletions: 10, createdAt: at('10:00'), mergedAt: at('10:20') },
  { number: 2, additions: 50, deletions: 5, createdAt: at('10:30'), mergedAt: at('11:00') },
  { number: 3, additions: 7, deletions: 0, createdAt: at('10:00'), mergedAt: at('10:40') },
  { number: 4, additions: 999, deletions: 999, createdAt: at('10:00', '2026-10-30'), mergedAt: at('10:30', '2026-10-30') },
];

test('figures are exact for fixture transcripts and PR JSON', () => {
  const r = buildReport({ date: '2026-10-31', texts: [session], prs });
  assert.deepEqual(r, {
    date: '2026-10-31',
    activeMinutes: 12, // 10:00-10:09 (9) + 10:49-10:52 (3), gap under 10 min only; 10:09-10:49 is idle; the sidechain line at 10:50 is ignored
    wallMinutes: 52,
    humanTurns: 3,
    mergedPrs: 3,
    linesAdded: 157,
    linesRemoved: 15,
    medianOpenToMergeMinutes: 30,
    humanMinutesPerMergedPr: 4,
  });
});

test('the report prints no prompt, reply or tool output text', () => {
  const r = JSON.stringify(buildReport({ date: '2026-10-31', texts: [session], prs }));
  assert.doesNotMatch(r, /SECRET|subagent prompt/);
});

test('no merged PRs gives null per-PR figures, not a division by zero', () => {
  const r = buildReport({ date: '2026-10-31', texts: [session], prs: [] });
  assert.equal(r.mergedPrs, 0);
  assert.equal(r.humanMinutesPerMergedPr, null);
  assert.equal(r.medianOpenToMergeMinutes, null);
});

test('dayReport reads the project and its worktree transcripts and the injected gh output', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-metrics-')));
  try {
    const project = path.join(base, 'work', 'proj');
    const slug = project.replace(/[/.]/g, '-');
    for (const name of [slug, `${slug}-wt-ship`, `${slug}x`]) {
      mkdirSync(path.join(base, 'home', '.claude', 'projects', name), { recursive: true });
      writeFileSync(path.join(base, 'home', '.claude', 'projects', name, 's.jsonl'), session);
    }
    assert.equal(transcriptFiles(project, path.join(base, 'home')).length, 2);
    const calls = [];
    const r = dayReport(project, '2026-10-31', { home: path.join(base, 'home'), exec: (cmd, args) => (calls.push([cmd, args]), JSON.stringify(prs)) });
    assert.equal(r.transcripts, 2);
    assert.equal(r.mergedPrs, 3);
    assert.equal(calls[0][0], 'gh');
    const none = dayReport(project, '2026-10-31', { home: path.join(base, 'home'), exec: () => { throw new Error('no gh'); } });
    assert.equal(none.prsUnavailable, true);
    assert.equal(none.mergedPrs, 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('the command rejects a bad subcommand or date with usage', () => {
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(metricsCommand({ args: [] }), 2);
    assert.equal(metricsCommand({ args: ['day', '--date', 'yesterday'] }), 2);
    assert.equal(metricsCommand({ args: ['day', '--bogus'] }), 2);
  } finally { console.error = err; }
});
