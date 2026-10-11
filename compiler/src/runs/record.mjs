// The run record (decision 0130): "a person started an autonomous run on this plan range", kept per user outside git, per
// project, beside the approvals store (same location, 0700 directory, 0600 file, atomic replace). The hook reads it; an
// agent cannot write it (the hook refuses `go-getter run start|end` and any call that opens the store directory).
// It holds ids and numbers only: no command output, prompt or file content.
//
// Shape of a project's entry: { active: record | null, last: record | null } where a record is
// { plan, steps, through, startedAt, timeoutAt, spendCapUsd, grants, endedAt?, endReason? }.
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { storeDir } from '../secrets/approvals.mjs';

const VERSION = 1;
export const DEFAULT_HOURS = 8;
export const MAX_HOURS = 72;
export const runsFile = (env = process.env) => path.join(storeDir(env), 'runs.json');
const keyOf = (project) => realpathSync(project);

function read(env) {
  try {
    const data = JSON.parse(readFileSync(runsFile(env), 'utf8'));
    return data?.version === VERSION && data.projects && typeof data.projects === 'object' ? data : { version: VERSION, projects: {} };
  } catch {
    return { version: VERSION, projects: {} };
  }
}

function write(data, env) {
  const dir = storeDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = runsFile(env);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

const expired = (record, now) => Date.parse(record.timeoutAt) <= now.getTime();

// The project's run state with expiry applied: an active record past its timeout becomes `last` (endReason "timeout") and is
// written back, so a later reader never sees it as active.
function load(project, env, now) {
  const data = read(env);
  const key = keyOf(project);
  const entry = data.projects[key] ?? { active: null, last: null };
  if (entry.active && expired(entry.active, now)) {
    entry.last = { ...entry.active, endedAt: entry.active.timeoutAt, endReason: 'timeout' };
    entry.active = null;
    data.projects[key] = entry;
    write(data, env);
  }
  return { data, key, entry };
}

// The active run of `project`, or null (none started, ended, or timed out).
export const activeRun = (project, { env = process.env, now = () => new Date() } = {}) => load(project, env, now()).entry.active;
// The run that ended last (for the report), or null.
export const lastRun = (project, { env = process.env, now = () => new Date() } = {}) => load(project, env, now()).entry.last;

// Starts a run. `steps` are the plan step ids the run covers, in order. Refuses while one is active for the project.
export function startRun(project, { plan, steps, through, hours = DEFAULT_HOURS, spendCapUsd = null, grants = [] }, { env = process.env, now = () => new Date() } = {}) {
  if (typeof plan !== 'string' || !plan) throw new Error('a run needs a plan');
  if (!Array.isArray(steps) || !steps.length || steps.some((s) => typeof s !== 'string')) throw new Error('a run needs at least one step');
  if (!(Number.isFinite(hours) && hours > 0 && hours <= MAX_HOURS)) throw new Error(`the timeout must be above 0 and at most ${MAX_HOURS} hours`);
  const t = now();
  const { data, key, entry } = load(project, env, t);
  if (entry.active) throw new Error(`a run is already active for this project (plan ${entry.active.plan}, until ${entry.active.timeoutAt}); end it first with: go-getter run end`);
  const record = { plan, steps, through: through ?? steps.at(-1), startedAt: t.toISOString(), timeoutAt: new Date(t.getTime() + hours * 3600_000).toISOString(), spendCapUsd, grants: [...new Set(grants)] };
  data.projects[key] = { active: record, last: entry.last };
  write(data, env);
  return record;
}

// Ends the active run; returns the finished record, or null when none was active.
export function endRun(project, { reason = 'ended', env = process.env, now = () => new Date() } = {}) {
  const t = now();
  const { data, key, entry } = load(project, env, t);
  if (!entry.active) return null;
  const finished = { ...entry.active, endedAt: t.toISOString(), endReason: reason };
  data.projects[key] = { active: null, last: finished };
  write(data, env);
  return finished;
}
