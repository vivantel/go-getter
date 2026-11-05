// A stop the hook asked a person about stays pending until it resolves (paper instruments, step P3). The host tells the hook nothing
// when a person answers, so the answer is read from what happens next in the same session:
//   the asked call runs (post-tool)                      -> approved
//   another call of the session comes first (pre-tool)   -> rejected (the agent moved on without it)
//   nothing happens within the timeout                   -> timed-out
// The store holds an action shape, a hash of the command and a session hash; never the command or the session id.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STATE_DIR, recordApproval } from './record.mjs';

const FILE = 'approvals-pending.json';
export const PENDING_TIMEOUT_MS = 15 * 60 * 1000;
const hash = (v) => createHash('sha256').update(String(v ?? '')).digest('hex').slice(0, 16);

function load(project) {
  try {
    const items = JSON.parse(readFileSync(path.join(project, STATE_DIR, FILE), 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function save(project, items) {
  mkdirSync(path.join(project, STATE_DIR), { recursive: true });
  const file = path.join(project, STATE_DIR, FILE);
  if (items.length || existsSync(file)) writeFileSync(file, JSON.stringify(items));
}

// Settles what an earlier ask left open: pending items of this session other than `except` are rejected, expired ones time out.
export function settlePending(project, { session, command, host }, now = new Date()) {
  const items = load(project);
  if (!items.length) return;
  const mine = hash(session);
  const same = hash(command);
  const keep = [];
  for (const it of items) {
    if (now.getTime() - Date.parse(it.at) > PENDING_TIMEOUT_MS) recordApproval(project, { action: it.action, outcome: 'timed-out', host: it.host });
    else if (it.session === mine && it.command !== same) recordApproval(project, { action: it.action, outcome: 'rejected', host: it.host });
    else keep.push(it);
  }
  if (keep.length !== items.length) save(project, keep);
}

export function addPendingApproval(project, { session, command, action, host }, now = new Date()) {
  const items = load(project).filter((i) => !(i.session === hash(session) && i.command === hash(command)));
  save(project, [...items, { at: now.toISOString(), session: hash(session), command: hash(command), action, ...(host ? { host } : {}) }]);
}

// The asked call ran: its pending approval is approved.
export function approvePending(project, { session, command }) {
  const items = load(project);
  const at = items.findIndex((i) => i.session === hash(session) && i.command === hash(command));
  if (at < 0) return false;
  const [it] = items.splice(at, 1);
  save(project, items);
  return recordApproval(project, { action: it.action, outcome: 'approved', host: it.host });
}
