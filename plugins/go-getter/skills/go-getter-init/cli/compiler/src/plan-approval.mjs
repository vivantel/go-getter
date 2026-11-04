// The authority of a plan approval (decision 0186): a record in the per-user store (the directory the approvals and the run
// record live in, which the hook keeps away from agents), never the `**Approval**:` line, which is only a human-readable note
// in a tracked file an agent could edit. The record is keyed by the project and the plan's project-relative path and holds,
// per step, a hash of its Do, Done-when and Check text, the set of step ids, the approver and the date. A step's marker,
// Progress and Result lines are not hashed, so finishing a step or adding a Result keeps the approval; changing what a step
// asks for, or adding a step, makes it out of date until a person approves again.
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { storeDir } from './secrets/approvals.mjs';
import { parsePlan, repoRoot } from './plan.mjs';

const VERSION = 1;
export const planApprovalsFile = (env = process.env) => path.join(storeDir(env), 'plan-approvals.json');
const sha = (text) => createHash('sha256').update(text).digest('hex');

function read(env) {
  try {
    const data = JSON.parse(readFileSync(planApprovalsFile(env), 'utf8'));
    return data?.version === VERSION && data.projects && typeof data.projects === 'object' ? data : { version: VERSION, projects: {} };
  } catch {
    return { version: VERSION, projects: {} };
  }
}

function write(data, env) {
  const dir = storeDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = planApprovalsFile(env);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

const locate = (file) => {
  const project = realpathSync(repoRoot(path.dirname(file)));
  return { project, rel: path.relative(project, realpathSync(file)).split(path.sep).join('/') };
};

// { <step id>: hash of the step's Do, Done-when and Check text }.
export function stepHashes(text) {
  const out = {};
  for (const s of parsePlan(text).steps) out[s.id] = sha(JSON.stringify([s.fields.Do ?? '', s.fields['Done-when'] ?? '', s.fields.Check ?? ''])).slice(0, 16);
  return out;
}

// The id of an approval: the plan path and its step hashes, so the run record names exactly what was approved.
export const approvalId = (rel, hashes) => sha(JSON.stringify([rel, Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : 1))])).slice(0, 12);

// A person's approval of the plan as it is now. Returns { changed, id }.
export function recordApproval(file, { by, now = new Date(), env = process.env }) {
  const { project, rel } = locate(file);
  const hashes = stepHashes(readFileSync(file, 'utf8'));
  const id = approvalId(rel, hashes);
  const data = read(env);
  const entries = (data.projects[project] ??= {});
  if (entries[rel]?.id === id) return { changed: false, id, entry: entries[rel] };
  entries[rel] = { id, steps: Object.keys(hashes), hashes, by, approvedAt: now.toISOString().slice(0, 10) };
  write(data, env);
  return { changed: true, id, entry: entries[rel] };
}

// { state: 'approved' | 'none' | 'stale', id?, changed: [step ids], entry? } for the plan file against the store.
export function approvalStatus(file, env = process.env) {
  const { project, rel } = locate(file);
  const entry = read(env).projects[project]?.[rel];
  if (!entry) return { state: 'none', changed: [] };
  const now = stepHashes(readFileSync(file, 'utf8'));
  const changed = Object.keys(now).filter((id) => entry.hashes?.[id] !== now[id]);
  return changed.length ? { state: 'stale', changed, entry } : { state: 'approved', id: entry.id, entry, changed: [] };
}

// Why this plan may not be started by an agent or worked, or null when a current store entry approves it.
export function approvalRefusal(file, env = process.env) {
  const name = path.basename(file);
  const s = approvalStatus(file, env);
  if (s.state === 'approved') return null;
  if (s.state === 'stale') return `approval out of date: step ${s.changed.join(', ')} changed since the plan was approved on ${s.entry.approvedAt}; a person runs: ! go-getter plan approve ${name}`;
  return `the plan has no approval recorded by a person (an Approval line in the file is only a note, and a plan approved only that way, such as an old draft, needs approving again); a person runs: ! go-getter plan approve ${name}`;
}
