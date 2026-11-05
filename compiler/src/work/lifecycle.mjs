// The life of a unit (decision 0173): its states, the retry budget and quarantine, cancel and supersede, accepting a changed brief, and
// the park after a repeated guardrail denial. Every state and counter is a field of the unit's ledger entry, so a project without a tracker
// computes all of it from the ledger. Lease reclaim and the pinned brief version are in `ops.mjs` and `recovery.mjs`; the claim refuses a
// unit that has exited or has had its third claimant.
//
// An exit (`cancelled`, `superseded`) is a `released` entry with an `exit` field; quarantine is a `parked` ask carrying `quarantine: true`
// (so it is escalated like any ask, 0168, and answering it frees the unit). Only the holder or issuer of a claim can write one: the ledger
// ignores anyone else's version (0166 item 5), so a cancel by another worker is reported as refused.
import { unitRef } from '../plan.mjs';
import { briefOf, briefVersion, makeEntry, sensitiveKinds } from './claim.mjs';
import { parkAsk, routeOf } from './asks.mjs';
import { beatTimes, commitEntries, fetchLedger, ledgerRef, noteLedger, pushRef, remoteOf, updateRecord } from './ledger.mjs';
import { MAX_CLAIMANTS, claimSettings, clockNow, diverged, entryFile, findUnit, readEntries, validity } from './ops.mjs';
import { pushUnitCheckpoint, resumePoint } from './recovery.mjs';

export const UNIT_STATES = ['draft', 'ready', 'claimed', 'parked', 'in-review', 'done', 'blocked', 'quarantined', 'cancelled', 'superseded'];
export const MAX_FAILURES = 2; // per claim, decision 0130 item 7
export const MAX_DENIALS = 2; // of one guardrail on one unit, decision 0130 item 8

const RETRIES = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (n) => Math.min(1000, 25 * 2 ** n) * (0.5 + Math.random());
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

// The state of a unit from its plan marker and its ledger entry. `live` is whether the entry's claim is live (not lapsed, not released).
// A unit with no live claim is `ready`; a lapsed lease therefore returns the unit to `ready` (item 2).
export function unitState({ stepState = 'pending', entry = null, live = false } = {}) {
  if (stepState === 'done' || stepState === 'moved') return 'done';
  if (entry?.exit) return entry.exit;
  if (entry?.blockedByHuman) return 'blocked';
  if (entry?.state === 'parked' && entry.ask?.quarantine) return 'quarantined';
  if (live && entry?.state === 'parked') return 'parked';
  if (live && entry?.review) return 'in-review';
  if (live) return 'claimed';
  if (stepState === 'draft') return 'draft';
  return 'ready';
}

// Reads the ledger, lets `mutate(entry, entries)` change the entry of `unit` held by `who` and writes the result. { ok, entry, commit }.
// `mutate` returns the new entry, or { error } to refuse.
async function changeEntry(root, ref, who, mutate, { now = clockNow(), remote, acceptRemoteLedger = false, message, anyone = false } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem } = found;
  const rem = remote === undefined ? remoteOf(root) : remote;
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; nothing was written');
    if (ledger.diverged) return fail('diverged', diverged(ledger));
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, ctx)));
    const entry = entries.find((e) => e.unit === unit);
    if (!anyone) {
      if (!entry || entry.state === 'released') return fail('not-held', `${unit} has no live claim`);
      if (entry.holder.id !== who.id) return fail('not-holder', `${unit} is held by ${entry.holder.kind} ${entry.holder.id}, not ${who.id}`);
    }
    const next = mutate(entry, entries, found);
    if (next?.error) return fail(next.code ?? 'refused', next.error);
    const kinds = sensitiveKinds(next);
    if (kinds.length) return fail('sensitive', `refused: the entry would write ${kinds.join(', ')} to the ledger`);
    const commit = commitEntries(root, ledger.tip, { [entryFile(unit)]: next }, { author: who.id, message: message ?? `update ${unit} by ${who.kind} ${who.id}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    return { ok: true, entry: next, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}

// The route of an ask about `ref`'s failure: its parent's owners first (decision 0173 item 3), then its own.
function parentRoute(root, found) {
  const parentRef = found.step.parent ? unitRef(found.step.parent, found.stem) : null;
  const parent = parentRef ? findUnit(root, parentRef) : null;
  const up = parent && !parent.error ? routeOf(root, parent) : [];
  return up.length ? up : routeOf(root, found);
}

// ---- retry budget and quarantine

// Parks the claim held by `who` into the quarantine ask for the parent's owner: out of `work next`, never retried silently (item 3).
// `reason` is a short label, never content. { ok, ask, entry }.
export async function quarantineUnit(root, ref, who, { reason, now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  const f = findUnit(root, ref);
  if (f.error) return fail('unknown-unit', f.error);
  return parkAsk(root, ref, who, {
    what: `${f.unit} keeps failing or lapsing; split it, fix its brief, raise its budget or cancel it`,
    default: 'stay quarantined',
    evidence: reason,
    class: 'irreversible',
    quarantine: true,
  }, { now, remote, acceptRemoteLedger, route: parentRoute(root, f) });
}

// The holder reports that its attempt failed (`reason` is a short label, never content). The count of failures under this claim goes
// up; at two the claim ends: the unit is released for the next claimant, or, when this was the third claimant, quarantined into an ask to
// the parent's owner. { ok, outcome: 'recorded' | 'released' | 'quarantined', failures }.
export async function recordFailure(root, ref, who, { reason = 'failed', now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  let outcome = 'recorded';
  const f = findUnit(root, ref);
  if (f.error) return fail('unknown-unit', f.error);
  const r = await changeEntry(root, ref, who, (entry) => {
    const failures = (entry.counters?.failures ?? 0) + 1;
    const counters = { ...entry.counters, failures, claimants: entry.counters?.claimants ?? 1 };
    if (failures < MAX_FAILURES) return { ...entry, counters, updated: now.toISOString() };
    if (counters.claimants >= MAX_CLAIMANTS) {
      outcome = 'quarantine';
      return { ...entry, counters, updated: now.toISOString() }; // parked into the quarantine ask below
    }
    outcome = 'released';
    return { ...entry, counters, state: 'released', scope: [], updated: now.toISOString() };
  }, { now, remote, acceptRemoteLedger, message: `failure of ${ref} by ${who.kind} ${who.id}` });
  if (!r.ok) return r;
  const failures = r.entry.counters.failures;
  if (outcome === 'quarantine') {
    const q = await quarantineUnit(root, ref, who, { reason: `${failures} failures under the last claim (${reason})`, now, remote, acceptRemoteLedger });
    if (!q.ok) return q;
    return { ok: true, outcome: 'quarantined', failures, ask: q.ask, entry: q.entry };
  }
  if (outcome === 'released') {
    updateRecord(root, (rec) => delete rec.claims[f.unit]);
    try {
      pushUnitCheckpoint(root, remote === undefined ? remoteOf(root) : remote, f.unit);
    } catch {
      // best effort
    }
  }
  return { ok: true, outcome, failures, entry: r.entry };
}

// ---- repeated guardrail denial

// A guardrail denied the same kind of call on this unit. The second denial by one guardrail parks the unit with the denial recorded
// (decision 0130 item 8, 0173 item 7). `guardrail` is the guardrail's id. { ok, outcome: 'recorded' | 'parked', count }.
export async function recordDenial(root, ref, who, guardrail, { now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(guardrail))) return fail('bad-guardrail', 'a guardrail id is lowercase words joined by hyphens');
  const r = await changeEntry(root, ref, who, (entry) => {
    const denials = { ...entry.counters?.denials };
    denials[guardrail] = (denials[guardrail] ?? 0) + 1;
    return { ...entry, counters: { failures: 0, claimants: 1, ...entry.counters, denials }, updated: now.toISOString() };
  }, { now, remote, acceptRemoteLedger, message: `denial by ${guardrail} on ${ref}` });
  if (!r.ok) return r;
  const count = r.entry.counters.denials[guardrail];
  if (count < MAX_DENIALS) return { ok: true, outcome: 'recorded', count };
  const parked = await parkAsk(root, ref, who, {
    what: `${findUnit(root, ref).unit} was denied by ${guardrail} ${count} times; it needs a person to say how to proceed`,
    default: 'stay parked',
    evidence: `guardrail ${guardrail}, ${count} denials on this unit`,
    class: 'irreversible',
    denial: guardrail,
  }, { now, remote, acceptRemoteLedger });
  if (!parked.ok) return parked;
  return { ok: true, outcome: 'parked', count, ask: parked.ask, entry: parked.entry };
}

// ---- cancel and supersede

// The units under `unit`: those the plan names as its children (transitively) and those whose ledger entries say so.
function descendants(found, entries) {
  const { parsed, unit, stem } = found;
  const all = [...parsed.steps, ...parsed.plans, ...(parsed.feature ? [parsed.feature] : [])];
  const parentOf = new Map(all.filter((u) => u.parent).map((u) => [u.unit, unitRef(u.parent, stem)]));
  for (const e of entries) if (e.parent) parentOf.set(e.unit, e.parent);
  const under = (u) => {
    for (let p = parentOf.get(u), n = 0; p && n < 1000; p = parentOf.get(p), n++) if (p === unit) return true;
    return false;
  };
  return [...new Set([...parentOf.keys()])].filter(under);
}

const exitEntry = (step, unit, who, now, leaseMs, extra) => ({
  ...makeEntry({ unit, holder: who, scope: [], now, leaseMs, brief: briefOf(step ?? { fields: {} }) }),
  state: 'released',
  ...extra,
});

// One write that ends `targets` (unit ids) with `exit`: a live claim is released (its scope given up), an unclaimed unit gets an entry
// so it is never offered again. Units already done in the plan (merged work) are left alone. Returns the units that now show the exit.
async function endUnits(root, found, targets, exit, who, { now, remote, acceptRemoteLedger, extra = {}, closeBranch }) {
  const rem = remote === undefined ? remoteOf(root) : remote;
  const settings = claimSettings(root);
  const { stem } = found;
  const all = [...found.parsed.steps, ...found.parsed.plans, ...(found.parsed.feature ? [found.parsed.feature] : [])];
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; nothing was written');
    if (ledger.diverged) return fail('diverged', diverged(ledger));
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const vopts = validity(settings, now, beatTimes(root, ledger.local ? null : rem, ctx));
    const { entries } = readEntries(root, ledger.tip, vopts);
    const files = {};
    const touched = [];
    const left = [];
    for (const unit of targets) {
      const u = all.find((x) => x.unit === unit);
      if (u?.state === 'done' || u?.state === 'moved') {
        left.push(unit); // merged work stays; undoing it is a revert unit
        continue;
      }
      const entry = entries.find((e) => e.unit === unit);
      if (entry?.exit === exit) continue;
      const stamp = { exit, ...extra, updated: now.toISOString() };
      files[entryFile(unit)] = entry ? { ...entry, state: 'released', scope: [], ...stamp } : exitEntry(u, unit, who, now, settings.leaseMs[who.kind], stamp);
      touched.push(unit);
    }
    if (!touched.length) return { ok: true, ended: [], left, refused: [] };
    const kinds = sensitiveKinds(files);
    if (kinds.length) return fail('sensitive', `refused: the entries would write ${kinds.join(', ')} to the ledger`);
    const commit = commitEntries(root, ledger.tip, files, { author: who.id, message: `${exit} ${found.unit} (${touched.length} unit${touched.length === 1 ? '' : 's'}) by ${who.kind} ${who.id}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    // the ledger ignores a version its author may not write: read back what readers see
    const after = readEntries(root, commit, vopts).entries;
    const ended = touched.filter((t) => after.find((e) => e.unit === t)?.exit === exit);
    const refused = touched.filter((t) => !ended.includes(t));
    const branches = [];
    for (const unit of ended) {
      const point = resumePoint(root, rem, unit);
      const branch = point?.branch?.name;
      if (branch && !branches.includes(branch)) branches.push(branch);
      updateRecord(root, (r) => delete r.claims[unit]); // this worktree stops renewing it
    }
    for (const branch of branches) await closeBranch?.({ branch });
    return { ok: true, ended, left, refused, branches };
  }
  return fail('contended', `${found.unit}: the ledger kept changing; try again`);
}

// Cancels `ref` and its unmerged descendants: claims released, open branches reported to `closeBranch({ branch })` (the caller closes
// them; this never touches a pull request itself), merged work untouched. { ok, ended, left, refused, branches }.
export async function cancelUnit(root, ref, who, { now = clockNow(), remote, acceptRemoteLedger = false, closeBranch } = {}) {
  const f = findUnit(root, ref);
  if (f.error) return fail('unknown-unit', f.error);
  if (f.step?.state === 'done' || f.step?.state === 'moved') return fail('settled', `${f.unit} is ${f.step.state}; undo merged work with a new revert unit, never a history rewrite`);
  const rem = remote === undefined ? remoteOf(root) : remote;
  const ledger = fetchLedger(root, f.stem, rem);
  const settings = claimSettings(root);
  const entries = ledger.tip ? readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, { nowMs: now.getTime(), skewMs: settings.skewMs }))).entries : [];
  return endUnits(root, f, [f.unit, ...descendants(f, entries)], 'cancelled', who, { now, remote, acceptRemoteLedger, closeBranch });
}

// Marks `ref` superseded by `successor` (an existing unit): open claims on it are released with the pointer, and a later claim is refused
// with it. { ok, ended, successor }.
export async function supersedeUnit(root, ref, successor, who, { now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  const f = findUnit(root, ref);
  if (f.error) return fail('unknown-unit', f.error);
  const s = findUnit(root, successor);
  if (s.error) return fail('unknown-successor', `successor: ${s.error}`);
  if (s.unit === f.unit) return fail('bad-successor', 'a unit cannot supersede itself');
  if (f.step?.state === 'done' || f.step?.state === 'moved') return fail('settled', `${f.unit} is ${f.step.state}`);
  const r = await endUnits(root, f, [f.unit], 'superseded', who, { now, remote, acceptRemoteLedger, extra: { successor: s.unit } });
  return r.ok ? { ...r, successor: s.unit } : r;
}

// ---- the brief changed

// The holder accepts the current brief of the unit: the entry's pinned version and the worktree's record move to it, so the next
// heartbeat stops flagging it. { ok, entry }.
export async function acceptBrief(root, ref, who, { now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  const f = findUnit(root, ref);
  if (f.error) return fail('unknown-unit', f.error);
  const version = briefVersion(briefOf(f.step));
  const r = await changeEntry(root, ref, who, (entry) => ({ ...entry, brief: version, updated: now.toISOString() }), { now, remote, acceptRemoteLedger, message: `re-read the brief of ${f.unit} by ${who.kind} ${who.id}` });
  if (!r.ok) return r;
  updateRecord(root, (rec) => {
    if (rec.claims[f.unit]) rec.claims[f.unit].brief = version;
  });
  return r;
}
