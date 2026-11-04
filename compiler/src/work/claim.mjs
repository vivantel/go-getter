// The rules of a claim (decision 0166), as pure functions over ledger entries: what an entry holds, when it is valid, when it
// is live, whether a new claim conflicts. Reading and writing the ledger is `ledger.mjs`; the verbs are `ops.mjs`.
import { createHash } from 'node:crypto';
import { effectiveScope } from '../plan.mjs';
import { findings } from '../secrets/patterns.mjs';
import { piiFindings } from '../secrets/pii.mjs';
import { ASK_KIND, askProblem, askStep } from './ask-rules.mjs';
import { overlap, scopeTokens } from './scope.mjs';

export const KINDS = ['human', 'agent', 'ci'];
export const STATES = ['claimed', 'parked', 'released'];
const MIN = 60_000;

export const DEFAULTS = { 'lease-agent': 60, 'lease-ci': 60, 'lease-human': 480, 'clock-skew': 5, 'parent-idle': 7, 'brief-max': 8, 'ask-timeout': 24 };

// Lease, skew, idle and brief-size settings from the merged `go-getter` data of the adopted orchestration decisions (pack
// answers); anything missing or not a positive number takes its default.
export function claimConfig(data = {}) {
  const num = (key) => (Number(data[key]) > 0 ? Number(data[key]) : DEFAULTS[key]);
  return {
    leaseMs: { agent: num('lease-agent') * MIN, ci: num('lease-ci') * MIN, human: num('lease-human') * MIN },
    skewMs: num('clock-skew') * MIN,
    parentIdleMs: num('parent-idle') * 24 * 60 * MIN,
    briefMax: num('brief-max') * 1024,
    askTimeoutMs: num('ask-timeout') * 60 * MIN,
  };
}

// The brief fields of a plan step: what a claimant is told to do. A claim pins their hash (the brief version).
export function briefOf(step) {
  return {
    Scope: effectiveScope(step),
    Accept: step.accept ?? null,
    Do: step.fields?.Do ?? null,
    'Done-when': step.doneWhen ?? step.fields?.['Done-when'] ?? null,
    Budget: step.budget ?? null,
  };
}

export const briefVersion = (brief) => createHash('sha256').update(JSON.stringify(Object.keys(brief).sort().map((k) => [k, brief[k]]))).digest('hex').slice(0, 16);

// A new entry. `holder` and `issuer` are { kind, id }; the issuer is the holder unless the unit was delegated.
export function makeEntry({ unit, holder, issuer = holder, scope, now, leaseMs, brief, parent = null, grant = null, delegated = false, briefMax }) {
  const at = now.toISOString();
  const entry = {
    unit,
    holder: { kind: holder.kind, id: holder.id },
    issuer: { kind: issuer.kind, id: issuer.id },
    scope: scopeTokens(scope),
    created: at,
    updated: at,
    leaseMs,
    expires: new Date(now.getTime() + leaseMs).toISOString(),
    brief: briefVersion(brief),
    state: 'claimed',
    counters: { failures: 0, claimants: 1 },
    grant,
    parent,
  };
  if (delegated) {
    const text = JSON.stringify(brief);
    if (Buffer.byteLength(text) <= briefMax) entry.briefFields = brief;
    else entry.briefSpilled = true; // larger than brief-max: the fields live on the tracker issue
  }
  return entry;
}

// Why an entry's shape is wrong, or null.
export function shapeProblem(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  if (typeof e.unit !== 'string' || !e.unit) return 'no unit';
  for (const who of ['holder', 'issuer']) {
    if (!e[who] || !KINDS.includes(e[who].kind) || typeof e[who].id !== 'string' || !e[who].id) return `${who} must have a kind (${KINDS.join('|')}) and an id`;
  }
  if (!Array.isArray(e.scope)) return 'scope is not a list';
  if (!STATES.includes(e.state)) return `unknown state ${e.state}`;
  for (const k of ['created', 'expires']) if (Number.isNaN(Date.parse(e[k]))) return `${k} is not a time`;
  if (!(e.leaseMs > 0)) return 'no lease length';
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Walks one entry's history, oldest first: [{ entry, author, commit }]. A version counts only when its commit was authored by
// the entry's holder or issuer and, while the previous version is still the holder's, its unit, holder, issuer, grant and scope
// are unchanged (scope may be released to empty); a different claimant may replace a lapsed or released entry. Returns the last
// valid entry (null when none), the versions it ignored and `grantAuthor`, who wrote the commit that issued its grant. Decision 0166 item 5.
// `skewMs` is the clock margin; `blocked(entry, previous)` may veto a replacement (a parent with live children). A parked entry is
// never replaced by another claimant, and a lapsed one only after its expiry plus the margin.
// More guards, each optional: `beatsOf(id, unit)` gives the times of a worker's heartbeats for a unit, so a takeover must also wait out the holder's last
// beat before it; `maxLeaseMs` ({ human, agent, ci }) caps `leaseMs` and so `expires`; `nowMs` rejects a `created` in the future;
// `allowParked` accepts any `parked` state; without it only a parked entry that released its scope counts, for a change request
// (`ask.kind` `change-request`, K4) or a well-formed parked ask (`ask.kind` `parked-ask`, K7); any other is ignored. A parked ask may be
// answered, escalated, defaulted or blocked by someone other than its holder, only as `ask-rules.mjs` allows.
export function validEntry(versions, { skewMs = 0, blocked = () => false, beatsOf, maxLeaseMs, nowMs, allowParked = false } = {}) {
  let good = null;
  let grantAuthor = null; // who wrote the commit that issued the current grant (decision 0171 item 6)
  const ignored = [];
  for (const v of versions) {
    const e = v.entry;
    const bad = (reason) => ignored.push({ commit: v.commit, reason });
    const shape = shapeProblem(e);
    if (shape) {
      bad(shape);
      continue;
    }
    const parkedOk = e.scope.length === 0 && (['change-request', 'spend'].includes(e.ask?.kind) || (e.ask?.kind === ASK_KIND && !askProblem(e.ask)));
    if (e.state === 'parked' && !allowParked && !parkedOk) {
      bad('state parked has no validated source (only a change request, a spend cap or a parked ask that released the scope parks a claim), so it is ignored and the lease applies');
      continue;
    }
    if (maxLeaseMs && e.leaseMs > maxLeaseMs[e.holder.kind]) {
      bad(`lease ${e.leaseMs} ms is longer than the ${maxLeaseMs[e.holder.kind]} ms configured for a ${e.holder.kind}`);
      continue;
    }
    if (Date.parse(e.expires) > Date.parse(e.created) + e.leaseMs + 1000) {
      bad('expires is later than created plus the lease');
      continue;
    }
    if (nowMs !== undefined && Date.parse(e.created) > nowMs + 2 * skewMs) { // two workers' clocks may each be a margin from the host's, in opposite directions
      bad('created is in the future');
      continue;
    }
    if (v.author !== e.holder.id && v.author !== e.issuer.id && !askStep(good, e, v.author)) {
      bad(`authored by ${v.author}, who is neither holder ${e.holder.id} nor issuer ${e.issuer.id}`);
      continue;
    }
    if (good && good.state !== 'released') {
      const fixed = e.unit === good.unit && same(e.holder, good.holder) && same(e.issuer, good.issuer) && same(e.grant, good.grant) && (same(e.scope, good.scope) || e.scope.length === 0);
      const at = Date.parse(e.created);
      const beat = beatsOf ? lastValidBeat(good, beatsOf(good.holder.id, good.unit).filter((ms) => ms <= at), skewMs) : 0;
      const lapsed = at >= Math.max(Date.parse(good.expires), beat ? beat + good.leaseMs : 0) + skewMs;
      if (!fixed && (!lapsed || good.state === 'parked' || blocked(e, good))) {
        bad('changes the holder, issuer, grant or scope of a claim that has not lapsed, is parked or has live children');
        continue;
      }
    }
    if (!good || good.state === 'released' || !same(good.grant, e.grant) || !same(good.issuer, e.issuer) || !same(good.holder, e.holder)) grantAuthor = v.author;
    good = e;
  }
  return { entry: good, ignored, grantAuthor };
}

// The last heartbeat of `entry` that counts. `times` is the holder's heartbeat times for the unit (ms, ascending; a number is one
// time). A beat counts only if it was made no later than the lease end then in force plus the margin, so a lapsed claim cannot be
// revived by a beat: only a ledger write can. The lease end starts at `expires` and each counted beat moves it to beat + lease.
export function lastValidBeat(entry, times, skewMs = 0) {
  const list = (Array.isArray(times) ? times : times ? [times] : []).filter((ms) => ms >= Date.parse(entry.created)).sort((a, b) => a - b);
  let end = Date.parse(entry.expires);
  let last = 0;
  for (const ms of list) {
    if (ms > end + skewMs) break;
    last = ms;
    end = Math.max(end, ms + entry.leaseMs);
  }
  return last;
}

// The time an entry's lease runs to: the later of its expiry and its holder's last heartbeat plus the lease.
export const leaseEnd = (e, beatMs) => Math.max(Date.parse(e.expires), beatMs ? beatMs + e.leaseMs : 0);

// Liveness of every entry: Map unit -> { entry, live, lapsed, parked, holdsScope, children, idle }.
//   ctx: { now (ms), skewMs, beats: Map holderId -> ms, parentIdleMs }
// A released entry is not live. A parked entry is live and never lapses. An entry with live children is live without a lease and
// holds no scope tokens (its children do); it is `idle` when neither it nor a child was touched for `parentIdleMs`.
export function annotate(entries, ctx) {
  const byUnit = new Map(entries.map((e) => [e.unit, e]));
  const kids = new Map();
  for (const e of entries) if (e.parent) kids.set(e.parent, [...(kids.get(e.parent) ?? []), e]);
  const memo = new Map();
  const beatOf = (e) => lastValidBeat(e, ctx.beats?.get(`${e.holder.id} ${e.unit}`) ?? ctx.beats?.get(e.holder.id), ctx.skewMs);
  const rawBeat = (e) => [ctx.beats?.get(`${e.holder.id} ${e.unit}`) ?? ctx.beats?.get(e.holder.id) ?? 0].flat().reduce((m, x) => Math.max(m, x), 0);
  const touched = (e) => Math.max(Date.parse(e.updated ?? e.created), e.state === 'parked' ? rawBeat(e) : beatOf(e)); // a parked claim has no lease: any beat is activity
  const visit = (e, trail = []) => {
    if (memo.has(e.unit)) return memo.get(e.unit);
    if (trail.includes(e.unit)) return { live: false }; // a parent cycle is never live
    const children = (kids.get(e.unit) ?? []).map((k) => visit(k, [...trail, e.unit]));
    const liveKids = children.filter((c) => c.live);
    let a;
    if (e.state === 'released') a = { entry: e, live: false, lapsed: false, parked: false, holdsScope: false, children: 0 };
    else if (e.state === 'parked') a = { entry: e, live: true, lapsed: false, parked: true, holdsScope: e.scope.length > 0 && !liveKids.length, children: liveKids.length };
    else if (liveKids.length) {
      const last = Math.max(touched(e), ...liveKids.map((c) => touched(c.entry)));
      a = { entry: e, live: true, lapsed: false, parked: false, holdsScope: false, children: liveKids.length, idle: ctx.now - last > ctx.parentIdleMs };
    } else {
      const lapsed = ctx.now > leaseEnd(e, beatOf(e)) + ctx.skewMs;
      a = { entry: e, live: !lapsed, lapsed, parked: false, holdsScope: !lapsed && e.scope.length > 0, children: 0 };
    }
    memo.set(e.unit, a);
    return a;
  };
  for (const e of entries) visit(e);
  return { states: new Map(entries.map((e) => [e.unit, memo.get(e.unit)])), byUnit };
}

// Whether claiming `unit` with `scope` (and `parent`, its parent unit if any) conflicts with a live entry. Ancestors of the unit
// and its own descendants never conflict with it. Returns { kind: 'unit' | 'scope', entry, tokens? } or null.
export function conflict(annotated, { unit, scope, parent = null }) {
  const { states, byUnit } = annotated;
  const ancestors = new Set();
  for (let p = parent; p && !ancestors.has(p); p = byUnit.get(p)?.parent) ancestors.add(p);
  const descends = (e) => {
    for (let p = e.parent, n = 0; p && n < 1000; p = byUnit.get(p)?.parent, n++) if (p === unit) return true;
    return false;
  };
  for (const [u, a] of states) {
    if (!a.live) continue;
    if (u === unit) return { kind: 'unit', entry: a.entry };
    if (ancestors.has(u) || descends(a.entry)) continue;
    if (!a.holdsScope) continue;
    const hit = overlap(a.entry.scope, scope);
    if (hit) return { kind: 'scope', entry: a.entry, tokens: hit };
  }
  return null;
}

// Secrets and personal data in the text fields of an entry or brief: the kinds found, never the matches. Each string is scanned as it
// is, not as escaped JSON, so a quoted `KEY="..."` assignment is seen. Every ledger write runs this (the pull-request scan does not
// see refs).
export function sensitiveKinds(value) {
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => (strings.push(k), walk(x)));
  };
  walk(value);
  const text = strings.join('\n');
  return [...new Set([...findings(text).map((f) => f.kind), ...piiFindings(text).map((f) => f.kind)])];
}
