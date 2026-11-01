// The throughput report for one day (decision 0154): human minutes per merged outcome, from host transcripts and merged PRs.
// Counts and times only; the transcript text is read to classify a turn and never kept (`telemetry-records-metadata-only`).
import path from 'node:path';
import os from 'node:os';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GAP_MS = 10 * 60_000;
const MIN = 60_000;
const round1 = (n) => Math.round(n * 10) / 10;
const WRAPPER = /^\s*<(local-command-|command-name>|command-message>|system-reminder>|task-notification>)/;

// Claude Code: a human text turn is a user line that is not meta, not a subagent's, and not a tool result or a host wrapper.
export function isHumanTurn(o) {
  if (o?.type !== 'user' || o.isMeta || o.isSidechain) return false;
  const c = o.message?.content;
  if (typeof c === 'string') return c.trim() !== '' && !WRAPPER.test(c);
  if (!Array.isArray(c) || c.some((b) => b?.type === 'tool_result')) return false;
  return c.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '' && !WRAPPER.test(b.text));
}

// The `YYYY-MM-DD` (UTC) of an ISO time, or null.
const dayOf = (iso) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : null);

// Parses transcript JSONL texts into the day's event times and human turns. A line that does not parse is skipped.
export function readEvents(texts, date) {
  const times = [];
  let humanTurns = 0;
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (dayOf(o?.timestamp) !== date || o.isSidechain) continue;
      times.push(Date.parse(o.timestamp));
      if (isHumanTurn(o)) humanTurns++;
    }
  }
  return { times: times.sort((a, b) => a - b), humanTurns };
}

// Active time sums the gaps between consecutive events that are under ten minutes; wall time is last minus first.
export function activity(times) {
  let active = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] < GAP_MS) active += times[i] - times[i - 1];
  return { activeMinutes: round1(active / MIN), wallMinutes: times.length ? round1((times[times.length - 1] - times[0]) / MIN) : 0 };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Merged-PR figures from `gh pr list --json number,additions,deletions,createdAt,mergedAt`.
export function prStats(prs, date) {
  const merged = prs.filter((p) => dayOf(p?.mergedAt) === date);
  const cycle = merged.map((p) => (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / MIN).filter(Number.isFinite);
  const med = median(cycle);
  return {
    mergedPrs: merged.length,
    linesAdded: merged.reduce((n, p) => n + (p.additions || 0), 0),
    linesRemoved: merged.reduce((n, p) => n + (p.deletions || 0), 0),
    medianOpenToMergeMinutes: med === null ? null : round1(med),
  };
}

export function buildReport({ date, texts, prs }) {
  const { times, humanTurns } = readEvents(texts, date);
  const act = activity(times);
  const pr = prStats(prs, date);
  return { date, ...act, humanTurns, ...pr, humanMinutesPerMergedPr: pr.mergedPrs ? round1(act.activeMinutes / pr.mergedPrs) : null };
}

// Claude Code keeps a project's transcripts in `~/.claude/projects/<path with / and . as ->`; worktrees of it are siblings with that prefix.
export function transcriptFiles(project, home = os.homedir()) {
  const dir = path.join(home, '.claude', 'projects');
  if (!existsSync(dir)) return [];
  const base = path.resolve(project).replace(/[/.]/g, '-');
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name !== base && !name.startsWith(`${base}-wt-`)) continue;
    for (const f of readdirSync(path.join(dir, name))) if (f.endsWith('.jsonl')) files.push(path.join(dir, name, f));
  }
  return files;
}

const defaultExec = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

// Merged PRs for the day (a day either side is fetched, since `merged:` compares UTC dates). Without `gh`, none.
export function mergedPrs(project, date, { exec = defaultExec } = {}) {
  try {
    const from = new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);
    const out = exec('gh', ['pr', 'list', '--state', 'merged', '--search', `merged:${from}..${to}`, '--limit', '200', '--json', 'number,additions,deletions,createdAt,mergedAt'], project);
    const list = JSON.parse(out);
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

export function dayReport(project, date, { exec, home } = {}) {
  const texts = transcriptFiles(project, home).map((f) => readFileSync(f, 'utf8'));
  const prs = mergedPrs(project, date, { exec });
  return { ...buildReport({ date, texts, prs: prs ?? [] }), ...(prs === null ? { prsUnavailable: true } : {}), transcripts: texts.length };
}
