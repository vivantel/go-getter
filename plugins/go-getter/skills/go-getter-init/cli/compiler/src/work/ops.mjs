// Claim, heartbeat and release (decision 0166 items 1, 2 and 5): the operations behind `go-getter work`. Each takes its clock and
// its notifier as arguments, so a test can drive them; none calls the tracker except through `notify`, which only claim and
// release use (a renewal never does).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readArtifacts } from '../artifacts.mjs';
import { parsePlan, planFiles, splitRef, stemOf, unitRef } from '../plan.mjs';
import { KINDS, annotate, briefOf, claimConfig, conflict, lastValidBeat, leaseEnd, makeEntry, sensitiveKinds, validEntry } from './claim.mjs';
import { applyGrants, humanIds } from './grant.mjs';
import { badWorkerId, beatTimes, cachedLedger, git, toplevel, updateRecord, worktreeGitDir, noteLedger, commitEntries, fetchLedger, pushHeartbeat, pushRef, readBeats, readHistory, readRecord, remoteOf, workerId, ledgerRef } from './ledger.mjs';

const RETRIES = 8;
// A reference as a full unit id: `<stem>#<id>`, or the bare stem for the feature itself.
const fullRef = (ref, stem) => (ref.includes('#') || ref === stem ? ref : `${stem}#${ref}`);
const entryFile = (unit) => `${unit.includes('#') ? unit.split('#')[1] : unit}.json`;
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

// Pack answers of the orchestration decisions that apply to claims.
export function orchestrationData(root) {
  return Object.assign(
    {},
    ...readArtifacts(root, ['decisions'])
      .filter((d) => d.data.status === 'active' && String(d.data['go-getter']?.['generated-by'] ?? '').startsWith('orchestration@'))
      .map((d) => d.data['go-getter']),
  );
}

export const claimSettings = (root) => claimConfig(orchestrationData(root));

// The caller's clock. A clock offset (to exercise skew) is honoured only with GO_GETTER_TEST_MODE=1, and says so on stderr.
let warned = false;
export function clockNow(env = process.env) {
  const offset = Number(env.GO_GETTER_CLOCK_OFFSET_MS) || 0;
  if (!offset || env.GO_GETTER_TEST_MODE !== '1') return new Date();
  if (!warned) {
    warned = true;
    console.error(`go-getter: TEST MODE: the clock is shifted by ${offset} ms; never set GO_GETTER_TEST_MODE outside tests`);
  }
  return new Date(Date.now() + offset);
}

// Who is calling: { kind, id }. The id is `--as`, else GO_GETTER_WORKER, else `w-` and a short hash of user, host and this worktree's
// path (and the CI run id under CI), so it names no person or machine and no two workers share one by accident. It is written once to
// the worktree's git directory, so a host rename or a moved worktree keeps its id (the claims record names the worktree by absolute
// path, so after a move its claims are not renewed until claimed again; not stored under CI, where the id follows the run). The kind is `--kind`, else GO_GETTER_WORKER_KIND, else `ci` under CI and `agent` otherwise (the shortest lease); a kind
// that is not human, agent or ci, and an id git cannot use in a ref (`..`, a `.lock` suffix), are errors.
export function identity(root, { as, kind } = {}, env = process.env) {
  const k = kind ?? env.GO_GETTER_WORKER_KIND ?? (env.CI ? 'ci' : 'agent');
  if (!KINDS.includes(k)) throw Object.assign(new Error(`worker kind "${k}" is not one of ${KINDS.join(', ')}`), { usage: true });
  const given = as ?? env.GO_GETTER_WORKER;
  let id;
  if (given !== undefined) {
    id = workerId(given);
    if (badWorkerId(String(given).trim().replace(/[^A-Za-z0-9._-]+/g, '-')) || badWorkerId(id)) throw Object.assign(new Error(`worker id "${given}" is not usable (no "..", no ".lock" suffix)`), { usage: true });
  } else {
    const run = env.GITHUB_RUN_ID || env.CI_JOB_ID || env.BUILD_ID;
    const gitDir = worktreeGitDir(root);
    const file = gitDir && path.join(gitDir, 'go-getter-worker');
    const stored = !run && file && existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    if (/^w-[0-9a-f]{12}$/.test(stored)) id = stored;
    else {
      id = `w-${createHash('sha256').update([env.USER || env.USERNAME || os.userInfo().username, os.hostname(), String(root), run ?? ''].join('\n')).digest('hex').slice(0, 12)}`;
      if (!run && file) {
        try {
          writeFileSync(file, `${id}\n`);
        } catch {
          // an unwritable git directory: the id is recomputed next time
        }
      }
    }
  }
  return { kind: k, id };
}

// The host named by a remote URL (`https://h/p`, `ssh://u@h:22/p`, `git+ssh://h/p`, `u@h:p`, `h:p`), or null. No user, password or port.
export function remoteHost(url) {
  const bare = String(url).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const host = /^(?:[^@/]*@)?(\[[0-9a-f:]+\]|[A-Za-z0-9.-]+)/i.exec(bare)?.[1];
  return host && !host.startsWith('[') && host !== '.' && host !== '..' ? host : null;
}

const headDate = async (url, fetchImpl) => {
  try {
    const res = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    const d = res.headers.get('date');
    return d ? new Date(d) : null;
  } catch {
    return null;
  }
};

// The host's clock as the caller can learn it, for a remote: a Date, or null when it cannot be learned, or undefined with no remote.
//   http(s)           the Date header of a HEAD request to the remote itself (an unparseable header is an Invalid Date)
//   absolute path, file://   this machine's own clock (the host is this machine)
//   anything else (ssh, git, scp-style `host:path`, git+ssh, ...)   the Date header of a HEAD request to https://<host>/, with no
//                     credentials; null when that fails, which blocks taking over a lapsed claim
export async function hostDateFor(root, remote, { fetchImpl = fetch } = {}) {
  if (!remote) return undefined;
  const url = git(root, ['remote', 'get-url', remote], { allowFail: true });
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return headDate(url.replace(/^(https?:\/\/)[^@/]*@/i, '$1'), fetchImpl);
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || /^file:\/\//i.test(url) || !/[.:@/]/.test(url)) return new Date(); // a path, file:// or a bare directory name is this machine
  const host = remoteHost(url);
  return host ? headDate(`https://${host}/`, fetchImpl) : null;
}

// Why a worker may not trust its clock against the host's, or null.
function clockProblem(hostDate, now, skewMs) {
  if (hostDate === undefined || hostDate === null) return null;
  const diff = Math.abs(hostDate.getTime() - now.getTime());
  if (Number.isNaN(diff)) return 'the host reported a date that cannot be read, so this clock cannot be checked; no claim was made';
  return diff > skewMs ? `this clock differs from the host's by ${Math.round(diff / 1000)} s, more than the ${Math.round(skewMs / 1000)} s margin; fix the clock first` : null;
}

// The unit `ref` (`<stem>#<id>`) in the repository's plans: { unit, stem, file, step, parsed } | { error }.
export function findUnit(root, ref) {
  const r = splitRef(ref);
  if (!r) return { error: `"${ref}" is not a unit id; use <plan-file-stem>#<id>` };
  const full = r.stem ? unitRef(ref) : r.id; // a bare name is a feature, whose id is its file stem
  const stem = r.stem ?? r.id;
  for (const rel of planFiles(root)) {
    if (stemOf(rel) !== stem) continue;
    const parsed = parsePlan(readFileSync(path.join(root, rel), 'utf8'), rel);
    const unit = [...parsed.steps, ...parsed.plans, ...(parsed.feature ? [parsed.feature] : [])].find((u) => u.unit === full);
    if (!unit) continue;
    if (!unit.claimable) return { error: `${full} has no header with an Id, so it cannot be claimed` };
    return { unit: full, stem, file: rel, step: unit, parsed };
  }
  return { error: `no unit ${full} in docs/plans` };
}

// Entries of a feature's ledger at `tip`, validated: { entries, ignored }. A claim by another worker replaces a lapsed one only after
// its expiry plus `skewMs`, never a parked one, and never a unit that had a live child.
// A grant is judged here too (decision 0171 item 6): an entry whose grant is wider than its parent's, was not written by its issuer, or is a
// root grant from anyone but a listed human is ignored, so every reader of the ledger sees the same entries. `opts.humans` overrides the
// workers file; `opts.parentOf(unit)` supplies a parent held in another feature's ledger.
export function readEntries(root, tip, opts = {}) {
  const { skewMs = 0 } = opts;
  const history = readHistory(root, tip);
  const first = history.map(({ versions }) => validEntry(versions, opts).entry);
  const kids = first.filter((e) => e?.parent);
  const blocked = (e, prev) => kids.some((k) => k.parent === prev.unit && k.state !== 'released' && Date.parse(k.created) <= Date.parse(e.created) && (k.state === 'parked' || Date.parse(e.created) < Date.parse(k.expires)));
  const entries = [];
  const ignored = [];
  const authors = new Map();
  for (const { file, versions } of history) {
    const v = validEntry(versions, { ...opts, blocked });
    if (v.entry) {
      entries.push(v.entry);
      authors.set(v.entry.unit, v.grantAuthor);
    }
    for (const i of v.ignored) ignored.push({ file, ...i });
  }
  if (!entries.some((e) => e.grant)) return { entries, ignored };
  const parentOf = opts.parentOf ?? ((unit) => otherLedgerEntry(root, unit, opts));
  const judged = applyGrants(entries, { authors, humans: opts.humans ?? humanIds(root), parentOf });
  for (const i of judged.ignored) ignored.push({ file: entryFile(i.unit), reason: i.reason });
  return { entries: judged.entries, ignored };
}

// The entry for `unit` in the last ledger seen of its own feature, when that is not the one being read (a unit delegated across plan files).
export function otherLedgerEntry(root, unit, opts) {
  const r = splitRef(unit);
  const tip = r?.stem && (opts.depth ?? 0) < 3 ? cachedLedger(root, r.stem) : null;
  return tip ? readEntries(root, tip, { ...opts, depth: (opts.depth ?? 0) + 1, parentOf: undefined }).entries.find((e) => e.unit === unit) ?? null : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (n) => Math.min(1000, 25 * 2 ** n) * (0.5 + Math.random());
const diverged = (ledger) => `the ledger on the remote does not continue the last version this clone saw (it was rewritten or deleted), so it is not trusted and nothing was written; ${ledger.recovery}`;

// What a reader needs to judge entries: the clock margin, the longest lease per kind, now, and each holder's heartbeat history.
const validity = (settings, now, beatsOf) => ({ skewMs: settings.skewMs, maxLeaseMs: settings.leaseMs, nowMs: now.getTime(), beatsOf });

// Entries of one feature, annotated with their liveness. Reads the last ledger seen (else the local ref) unless `remote` names a
// remote to fetch from first (an unreachable remote leaves the last one seen). For `plan status`.
export function ledgerView(root, stem, { now = clockNow(), settings = claimSettings(root), remote = null } = {}) {
  const fetched = remote ? fetchLedger(root, stem, remote) : null;
  const tip = fetched?.online && fetched.tip ? fetched.tip : cachedLedger(root, stem);
  const ctx = { now: now.getTime(), skewMs: settings.skewMs, parentIdleMs: settings.parentIdleMs };
  if (!tip) return { tip: null, entries: [], annotated: annotate([], ctx) };
  // an unreachable remote leaves the heartbeats last fetched (the cache refs), not the empty local namespace
  const { beats } = readBeats(root, remote, { nowMs: ctx.now, skewMs: ctx.skewMs, fetch: Boolean(fetched?.online) });
  const { entries, ignored } = readEntries(root, tip, validity(settings, now, beatTimes(root, remote, { nowMs: ctx.now, skewMs: ctx.skewMs })));
  return { tip, entries, ignored, annotated: annotate(entries, { ...ctx, beats }) };
}

// ---- claim

// Claims `ref` for `who`. `hostDate` is the host's clock from `hostDateFor` (undefined: not checked, as in a local repository; null:
// could not be learned, so no claim is made unless `unverifiedClock` is set, and a lapsed claim is never taken over). `hooks`
// (`beforePush`, `afterPush`) lets a test interleave another writer at a chosen step. Returns { ok: true, entry, commit, local, tookOver? } |
// { ok: false, code, error, behind? }.
export async function claimUnit(root, ref, who, { now = clockNow(), hostDate, remote, issuer = who, parent, notify, acceptRemoteLedger = false, unverifiedClock = false, hooks, grant = null, author, delegator } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem, step } = found;
  if (step.state === 'done' || step.state === 'moved') return fail('settled', `${unit} is ${step.state}`);
  const settings = claimSettings(root);
  const bad = clockProblem(hostDate, now, settings.skewMs);
  if (bad) return fail('clock', bad);
  const rem = remote === undefined ? remoteOf(root) : remote;
  const brief = briefOf(step);
  const parentUnit = parent ? fullRef(parent, stem) : step.parent ? fullRef(step.parent, stem) : null;
  const entry = makeEntry({ unit, holder: who, issuer, scope: brief.Scope, now, leaseMs: settings.leaseMs[who.kind], brief, parent: parentUnit, grant, delegated: Boolean(parent), briefMax: settings.briefMax });
  const kinds = sensitiveKinds([entry, brief]);
  if (kinds.length) return fail('sensitive', `refused: the claim would write ${kinds.join(', ')} to the ledger; remove it from the unit's brief first`);
  const name = entryFile(unit);
  const ctx = { now: now.getTime(), skewMs: settings.skewMs, parentIdleMs: settings.parentIdleMs };
  let note = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; a claim needs it (no claim was made)');
    if (ledger.diverged) return fail('diverged', diverged(ledger));
    const { beats, online } = readBeats(root, ledger.local ? null : rem, { nowMs: ctx.now, skewMs: ctx.skewMs });
    if (!online) return fail('offline', 'the remote heartbeats could not be read, so liveness cannot be judged (no claim was made)');
    const { entries } = readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, { nowMs: ctx.now, skewMs: ctx.skewMs })));
    const view = annotate(entries, { ...ctx, beats });
    if (parent) {
      const problem = parentProblem(root, parent, { stem, step, entries, view, who: delegator ?? who, ctx });
      if (problem) return fail('bad-parent', problem);
    }
    const clash = conflict(view, { unit, scope: brief.Scope, parent: parentUnit });
    if (clash) {
      const e = clash.entry;
      const why = clash.kind === 'unit' ? `${unit} is held by ${e.holder.kind} ${e.holder.id}` : `its scope overlaps ${e.unit} (${clash.tokens.join(' and ')}), held by ${e.holder.kind} ${e.holder.id}`;
      return fail('queued', `queued: ${why}, lease to ${new Date(leaseEnd(e, lastValidBeat(e, beats.get(`${e.holder.id} ${e.unit}`), settings.skewMs))).toISOString()}`, { behind: { unit: e.unit, holder: e.holder, kind: clash.kind } });
    }
    const previous = entries.find((e) => e.unit === unit);
    if (previous?.blockedByHuman) return fail('blocked-by-human', `${unit} is blocked by a human: an ask went unanswered past its last owner; answer it (go-getter work answer) before claiming`);
    const takeover = previous && previous.state !== 'released';
    if (takeover && rem && hostDate === null) return fail('clock-unverified', `${unit} is held by ${previous.holder.id} under a lapsed lease, but the host's time could not be learned from this remote (no Date header from the remote or from https://<host>/), so this clock cannot be shown to be right and the lease is not taken over. To go on: the holder releases it (go-getter work release ${unit}), or the owner runs that as the holder (--as ${previous.holder.id}), or use an https remote`);
    if (!takeover && rem && hostDate === null && !unverifiedClock) {
      return fail('clock-unverified', `${unit}: the host's time could not be learned from this remote (no Date header from the remote or from https://<host>/), so this clock cannot be shown to be within the ${Math.round(settings.skewMs / 60000)} minute margin and no claim was made (decision 0166). To go on: use a remote whose host answers over https, or the owner passes --unverified-clock to claim a unit nobody holds, accepting that a wrong clock can break the lease`);
    }
    const next = takeover ? { ...entry, counters: { failures: previous.counters?.failures ?? 0, claimants: (previous.counters?.claimants ?? 0) + 1 } } : entry;
    if (previous?.spent) next.spent = previous.spent; // what a unit spent stays on its entry whoever holds it next
    const commit = commitEntries(root, ledger.tip, { [name]: next }, { author: author ?? who.id, message: `claim ${unit} by ${who.kind} ${who.id}`, now });
    await hooks?.beforePush?.({ attempt, tip: ledger.tip, commit });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    await hooks?.afterPush?.({ commit });
    // The push won the compare-and-swap; confirm that readers see this entry as the valid, live claim before saying so.
    const after = fetchLedger(root, stem, rem);
    const check = after.online && !after.diverged ? readEntries(root, after.tip, validity(settings, now, beatTimes(root, after.local ? null : rem, { nowMs: ctx.now, skewMs: ctx.skewMs }))).entries : [];
    const mine = check.find((e) => e.unit === unit);
    if (!mine || mine.holder.id !== who.id || mine.created !== next.created || mine.state !== 'claimed') {
      return fail('lost-race', `${unit}: the claim was written but readers do not see it as the live claim (another write replaced it, or it is not valid); it is not held. Try again`);
    }
    if (rem) noteLedger(root, stem, after.tip ?? commit);
    if (!rem) note = 'no remote: this claim is local to this repository and excludes only workers who share it';
    else if (hostDate === null) note = "WARNING: --unverified-clock: the host's time could not be learned, so this clock was not checked; a wrong clock can break leases";
    updateRecord(root, (r) => {
      r.claims[unit] = { stem, remote: rem, worker: who, leaseMs: next.leaseMs, expires: next.expires, scope: next.scope, worktree: root };
    });
    if (notify) await notify(`claimed by ${who.kind} ${who.id}`, { unit, file: found.file, step });
    const resume = previous?.state === 'released' && previous.ask?.kind === 'parked-ask' && previous.answer ? { branch: previous.ask.branch, base: previous.ask.base } : null;
    return { ok: true, entry: next, commit, local: !rem, note, resume, tookOver: takeover && previous.holder.id !== who.id ? previous.holder : null };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}

// Why `--parent` is refused, or null: the parent must be an existing unit; it must be the plan's own `Parent:` of this unit, or hold a
// live entry whose holder or issuer is the claimant (so a child never makes another worker's unit leaseless or slips past its scope).
function parentProblem(root, parent, { stem, step, entries, view, who, ctx }) {
  const pf = findUnit(root, parent);
  if (pf.error) return `--parent ${parent}: ${pf.error}`;
  if (step.parent && fullRef(step.parent, stem) === pf.unit) return null;
  let live = view.states.get(pf.unit);
  if (pf.stem !== stem) {
    const tip = cachedLedger(root, pf.stem);
    const there = tip ? readEntries(root, tip, { skewMs: ctx.skewMs }).entries : [];
    live = annotate(there, ctx).states.get(pf.unit);
  }
  const e = live?.entry ?? entries.find((x) => x.unit === pf.unit);
  if (!live?.live || !e) return `--parent ${pf.unit} has no live claim`;
  if (e.holder.id !== who.id && e.issuer.id !== who.id) return `--parent ${pf.unit} is held by ${e.holder.id}, who has not delegated this unit to ${who.id}`;
  return null;
}

// ---- heartbeat

// Renews the caller's claim on `ref` when less than half of the lease remains: one heartbeat commit on the worker's own ref, naming
// the units it renews (those held from this worktree). Nothing else is written. { ok, renewed, reason }.
export async function heartbeatUnit(root, ref, who, { now = clockNow(), remote, hostDate, acceptRemoteLedger = false } = {}) {
  const unit = ref;
  const record = readRecord(root);
  const mine = record.claims?.[unit];
  if (!mine || mine.worker.id !== who.id || (mine.worktree && mine.worktree !== root)) return fail('not-held', `${unit} is not claimed by ${who.id} from this worktree`);
  const settings = claimSettings(root);
  const rem = remote === undefined ? mine.remote : remote;
  const remaining = Date.parse(mine.expires) - now.getTime();
  if (remaining >= mine.leaseMs / 2) return { ok: true, renewed: false, reason: 'fresh', remainingMs: remaining };
  if (now.getTime() > Date.parse(mine.expires) + settings.skewMs) return fail('lapsed', `${unit}: the lease lapsed at ${mine.expires} (plus the ${Math.round(settings.skewMs / 60000)} minute margin); a heartbeat cannot revive it. Claim it again with go-getter work claim ${unit}`);
  const bad = clockProblem(hostDate, now, settings.skewMs);
  if (bad) return fail('clock', bad);
  const ledger = fetchLedger(root, mine.stem, rem, { accept: acceptRemoteLedger });
  if (!ledger.online) return { ok: true, renewed: false, reason: 'offline' };
  if (ledger.diverged) return fail('diverged', diverged(ledger));
  const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
  const { entries } = readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, ctx)));
  const entry = entries.find((e) => e.unit === unit);
  if (!entry || entry.state === 'released' || entry.holder.id !== who.id) {
    updateRecord(root, (r) => delete r.claims[unit]);
    return fail('lost', `${unit} is no longer held by ${who.id}; stop working on it`);
  }
  const held = new Set(entries.filter((e) => e.state !== 'released' && e.holder.id === who.id).map((e) => e.unit));
  const units = Object.keys(record.claims).filter((u) => record.claims[u].worker.id === who.id && record.claims[u].worktree === root && held.has(u));
  let push = pushHeartbeat(root, rem, who.id, units, now);
  if (push.rejected) push = pushHeartbeat(root, rem, who.id, units, now);
  if (push.offline) return { ok: true, renewed: false, reason: 'offline' };
  if (!push.ok) return fail('contended', `${unit}: the heartbeat could not be pushed (${push.ref})`);
  updateRecord(root, (r) => {
    for (const u of units) if (r.claims[u]) r.claims[u].expires = new Date(now.getTime() + r.claims[u].leaseMs).toISOString();
  });
  return { ok: true, renewed: true, pushed: push.pushed, until: new Date(now.getTime() + mine.leaseMs + settings.skewMs).toISOString() };
}

// Renews the claims held from this worktree that are under half their lease (never another worktree's), ignoring any failure: called after each go-getter verb.
// Returns the units renewed. Does nothing when called from go-getter's own push.
export async function renewAll(cwd, env = process.env) {
  if (env.GO_GETTER_REENTRY) return [];
  const root = toplevel(cwd) ?? cwd;
  const record = readRecord(root);
  const now = clockNow(env);
  const due = Object.entries(record.claims ?? {}).filter(([, c]) => c.worktree === root && Date.parse(c.expires) - now.getTime() < c.leaseMs / 2);
  const out = [];
  for (const [unit, c] of due) {
    try {
      const r = await heartbeatUnit(root, unit, c.worker, { now, hostDate: await hostDateFor(root, c.remote) });
      if (r.renewed) {
        out.push(unit);
        break; // one heartbeat renews every claim of the worker held from this worktree
      }
      if (r.reason === 'offline') break; // the remote is unreachable: do not wait out the same timeouts for each due claim
    } catch {
      // renewal is best effort
    }
  }
  return out;
}

// ---- release

// Releases the claim on `ref`: its holder (exactly) writes a `released` entry with no scope; the unit is free at once.
export async function releaseUnit(root, ref, who, { now = clockNow(), remote, notify, acceptRemoteLedger = false } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem } = found;
  const record = readRecord(root);
  const rem = remote === undefined ? record.claims?.[unit]?.remote ?? remoteOf(root) : remote;
  const name = entryFile(unit);
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; the claim stays held until its lease lapses');
    if (ledger.diverged) return fail('diverged', diverged(ledger));
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, ctx)));
    const entry = entries.find((e) => e.unit === unit);
    if (!entry || entry.state === 'released') return fail('not-held', `${unit} has no live claim`);
    if (entry.holder.id !== who.id) return fail('not-holder', `${unit} is held by ${entry.holder.kind} ${entry.holder.id}, not ${who.id}`);
    const next = { ...entry, state: 'released', scope: [], updated: now.toISOString() };
    const commit = commitEntries(root, ledger.tip, { [name]: next }, { author: who.id, message: `release ${unit} by ${who.kind} ${who.id}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    updateRecord(root, (r) => delete r.claims[unit]);
    if (notify) await notify('released', { unit, file: found.file, step: found.step });
    return { ok: true, entry: next, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}

// Parks a claim that waits for the answer to a change request (decision 0167 item 2) or, with `ask`, to a parked ask (K7, `asks.mjs`): the claim stays, never lapses, and holds no scope,
// so an overlapping unit can be claimed meanwhile. The worker stops renewing it (the worktree's record drops it).
export async function parkUnit(root, ref, who, { to, ask, now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem } = found;
  const rem = remote === undefined ? readRecord(root).claims?.[unit]?.remote ?? remoteOf(root) : remote;
  const name = entryFile(unit);
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; the claim stays held and keeps its scope');
    if (ledger.diverged) return fail('diverged', diverged(ledger));
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, validity(settings, now, beatTimes(root, ledger.local ? null : rem, ctx)));
    const entry = entries.find((e) => e.unit === unit);
    if (!entry || entry.state === 'released') return fail('not-held', `${unit} has no live claim`);
    if (entry.holder.id !== who.id) return fail('not-holder', `${unit} is held by ${entry.holder.kind} ${entry.holder.id}, not ${who.id}`);
    const next = { ...entry, state: 'parked', scope: [], ask: ask ?? { kind: 'change-request', to }, updated: now.toISOString() };
    const commit = commitEntries(root, ledger.tip, { [name]: next }, { author: who.id, message: ask ? `park ${unit} for an ask` : `park ${unit} for a change request to ${to}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    updateRecord(root, (r) => delete r.claims[unit]);
    return { ok: true, entry: next, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}

// `plan status` computed from the claims ledger and not from a marker alone: a step with a live claim is in progress, and a live
// claim on a step marked done is reported as a mismatch. With `opts.remote` it fetches the ledger first (an unreachable remote
// leaves the last one seen); unchanged when no ledger exists.
export function claimOverlay(root, stem, status, opts) {
  const view = ledgerView(root, stem, opts);
  if (!view.entries.length) return status;
  const counts = { ...status.counts };
  const steps = status.steps.map((s) => {
    const a = view.annotated.states.get(`${stem}#${s.id}`);
    if (!a?.live) return s;
    const claim = { holder: a.entry.holder.id, kind: a.entry.holder.kind, expires: a.entry.expires, ...(a.parked ? { parked: true } : {}), ...(a.idle ? { idle: true } : {}) };
    if (s.status === 'done') return { ...s, claim, mismatch: `${s.mismatch ? `${s.mismatch}; ` : ''}live claim by ${claim.kind} ${claim.holder} on a step marked done` };
    if (s.status === 'in progress') return { ...s, claim };
    counts[s.status]--;
    counts['in progress']++;
    return { ...s, status: 'in progress', claim };
  });
  return { ...status, counts, steps };
}
