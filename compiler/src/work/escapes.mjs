// Escapes and the sampling rate (decision 0172 item 4): a defect found at a higher level than the one that merged it raises the audit
// sampling rate at the level below the one that found it, within the human's daily read cap. The log holds metadata only.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { STATE_DIR } from '../telemetry/record.mjs';

export const LEVELS = ['step', 'plan', 'feature', 'product'];
export const ESCAPES_LOG = path.join(STATE_DIR, 'escapes.jsonl');
export const BASE_RATE = 0.2; // the PR-level target of 0158 item 2
export const PER_ESCAPE = 0.1;
const DAY = 86_400_000;

// Records that `unit` (merged at `mergedAt`) had a defect found at `foundAt`. An escape only when `foundAt` is higher than `mergedAt`; the
// rate that rises is the level just below the finder's. { escape, raises? } | { escape: false }.
export function recordEscape(project, { unit, mergedAt, foundAt, now = new Date() }) {
  const m = LEVELS.indexOf(mergedAt);
  const f = LEVELS.indexOf(foundAt);
  if (m < 0 || f < 0) return { escape: false, error: `levels are ${LEVELS.join(', ')}` };
  if (f <= m) return { escape: false };
  const raises = LEVELS[f - 1];
  mkdirSync(path.join(project, STATE_DIR), { recursive: true });
  appendFileSync(path.join(project, ESCAPES_LOG), `${JSON.stringify({ ts: now.toISOString(), unit, mergedAt, foundAt, raises })}\n`);
  return { escape: true, raises };
}

function readEscapes(project) {
  try {
    return readFileSync(path.join(project, ESCAPES_LOG), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// The audit sampling rate at `level`: the base rate plus a step per escape in the window that raised it, never above 1. With `cap` (reads per
// human per day) and the number of `merged` items, never above what the cap allows to be read; `metrics flow` reports the realized coverage.
export function samplingRate(project, level, { base = BASE_RATE, now = new Date(), windowDays = 30, merged, cap } = {}) {
  const n = readEscapes(project).filter((e) => e.raises === level && now.getTime() - Date.parse(e.ts) <= windowDays * DAY).length;
  let rate = Math.min(1, base + PER_ESCAPE * n);
  if (cap !== undefined && merged > 0) rate = Math.min(rate, cap / merged);
  return Math.round(rate * 1e4) / 1e4; // 0.2 + 0.1 must not become 0.30000000000000004 and round a sample of ten up to four
}
