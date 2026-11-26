// What a block led to (plan step A4). A transcript shows that a call was refused; it does not show which go-getter hook or guardrail refused
// it, which fix the refusal named, or what happened next. This records those three and nothing else, as metadata (guardrail
// telemetry-records-metadata-only): ids from fixed shapes, never a command, a path or the reason text.
//
// Resolutions, read from what the same session does next:
//   fixed-by-verb    the agent ran the verb the refusal named (a denial)
//   allowed-on-retry the same call ran after a denial (a grant, a changed state)
//   human-approved   a person said yes to an ask
//   human-refused    a person said no to an ask
//   abandoned        another call came first, or nothing happened before the timeout
import { createHash } from 'node:crypto';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STATE_DIR, recordQuietly } from './record.mjs';
import { FIELDS } from './schema.mjs';

const FILE = 'blocks-pending.json';
export const BLOCK_TIMEOUT_MS = 15 * 60 * 1000;
const hash = (v) => createHash('sha256').update(String(v ?? '')).digest('hex').slice(0, 16);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const VERB = /`(go-getter [a-z][a-z-]*(?: [a-z][a-z-]*)?)[^`]*`/;

// The fix a refusal names: the first go-getter verb in backticks in its reason, else `ask-user` when it hands the case to a person,
// else `none`. `verb` is the text to match a later call against; it stays in the local state file and never reaches the log.
export function namedFix(reason) {
  const text = typeof reason === 'string' ? reason : '';
  const verb = VERB.exec(text)?.[1];
  if (verb) return { fix: slug(verb), verb };
  if (/ask the user|needs a human|Approve:/i.test(text)) return { fix: 'ask-user' };
  return { fix: 'none' };
}

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

export function recordBlockOutcome(project, { guardrail, hook, fix, resolution, host }) {
  const rec = { event: 'block:outcome', resolution };
  if (FIELDS.guardrail(guardrail)) rec.guardrail = guardrail;
  if (FIELDS.hook(hook)) rec.hook = hook;
  if (FIELDS.fix(fix)) rec.fix = fix;
  if (FIELDS.host(host)) rec.host = host;
  return recordQuietly(project, rec);
}

// A denial waits for the session's next call. Asks resolve through approval-pending, which calls `resolveAsk`.
export function addPendingBlock(project, { session, command, guardrail, hook, fix, verb, host }, now = new Date()) {
  const items = load(project).filter((i) => !(i.session === hash(session) && i.command === hash(command)));
  save(project, [...items, { at: now.toISOString(), session: hash(session), command: hash(command), guardrail, hook, fix, ...(verb ? { verb } : {}), ...(host ? { host } : {}) }]);
}

// Called after the session's next pre-tool decision. `allowed`: that call is not denied.
export function settleBlocks(project, { session, command, allowed, host }, now = new Date()) {
  const items = load(project);
  if (!items.length) return;
  const mine = hash(session);
  const same = hash(command);
  const keep = [];
  for (const it of items) {
    let resolution = null;
    if (now.getTime() - Date.parse(it.at) > BLOCK_TIMEOUT_MS) resolution = 'abandoned';
    else if (it.session === mine) {
      if (it.command === same) resolution = allowed ? 'allowed-on-retry' : null; // denied again: still open
      else if (allowed && it.verb && typeof command === 'string' && command.trim().startsWith(it.verb)) resolution = 'fixed-by-verb';
      else resolution = 'abandoned';
    }
    if (resolution) recordBlockOutcome(project, { ...it, resolution, host: it.host ?? host });
    else keep.push(it);
  }
  if (keep.length !== items.length) save(project, keep);
}

const ASK_RESOLUTION = { approved: 'human-approved', rejected: 'human-refused', 'timed-out': 'abandoned' };

// An ask resolved (approval outcome known): record what it led to.
export function resolveAsk(project, block, outcome, host) {
  if (!block || !ASK_RESOLUTION[outcome]) return false;
  return recordBlockOutcome(project, { ...block, resolution: ASK_RESOLUTION[outcome], host });
}

// Per guardrail and hook: how many blocks, the fixes they named, what each led to, and how many ended with the work going on
// (fixed by verb, allowed on retry, or a person said yes). `date` (UTC) limits it to one day. Counts only.
export function summarizeBlocks(records, date) {
  const out = {};
  const row = (r) => (out[`${r.guardrail ?? 'unknown'}/${r.hook ?? 'unknown'}`] ??= { blocks: 0, fixNamed: {}, resolutions: {}, retrySucceeded: 0 });
  for (const r of records) {
    if (date && String(r.ts).slice(0, 10) !== date) continue;
    if (r.event === 'gate:stop' && r.hook && (r.trigger === 'deny' || r.trigger === 'ask')) {
      const e = row(r);
      e.blocks += 1;
      e.fixNamed[r.fix ?? 'none'] = (e.fixNamed[r.fix ?? 'none'] ?? 0) + 1;
    } else if (r.event === 'block:outcome') {
      const e = row(r);
      e.resolutions[r.resolution] = (e.resolutions[r.resolution] ?? 0) + 1;
      if (['fixed-by-verb', 'allowed-on-retry', 'human-approved'].includes(r.resolution)) e.retrySucceeded += 1;
    }
  }
  return out;
}

// A hook that failed (an exception, an unreadable payload) is not a block, but it costs a person time, and the transcript does not say which
// hook it was. One record per failure: the hook id and a trigger slug, never the error text.
export function recordHookError(project, { hook, trigger, host }) {
  const rec = { event: 'hook:error' };
  if (FIELDS.hook(hook)) rec.hook = hook;
  if (FIELDS.trigger(trigger)) rec.trigger = trigger;
  if (FIELDS.host(host)) rec.host = host;
  return recordQuietly(project, rec);
}

// Per hook and trigger: how many failures. `date` (UTC) limits it to one day. Counts only.
export function summarizeHookErrors(records, date) {
  const out = {};
  for (const r of records) {
    if (r.event !== 'hook:error' || (date && String(r.ts).slice(0, 10) !== date)) continue;
    const key = `${r.hook ?? 'unknown'}/${r.trigger ?? 'unknown'}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
