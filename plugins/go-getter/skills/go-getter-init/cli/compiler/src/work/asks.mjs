// Parked asks (decision 0168): a unit that needs a human records the ask, becomes `parked`, releases its worker and gives up its
// scope; the ask is routed by the chain of `Owner-id`s from the unit upward, then by declared path owners. A reversible ask takes
// its default after the timeout; an irreversible one escalates up the route and, past the last owner, blocks the unit on a human.
// The ask lives in the unit's ledger entry (`ask-rules.mjs` says which later versions are valid); the log holds metadata only.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { activePlanFiles, effectiveScope, parsePlan, stemOf } from '../plan.mjs';
import { STATE_DIR } from '../telemetry/record.mjs';
import { sensitiveKinds } from './claim.mjs';
import { ASK_KIND, CLASSES, IMPACTS, askProblem, effectiveClass, isAsk } from './ask-rules.mjs';
import { beatTimes, commitEntries, fetchLedger, git, ledgerRef, noteLedger, pushRef, remoteOf } from './ledger.mjs';
import { claimSettings, claimUnit, clockNow, findUnit, ledgerView, parkUnit, readEntries } from './ops.mjs';
import { scopesOverlap } from './scope.mjs';

export const ASKS_LOG = path.join(STATE_DIR, 'asks.jsonl');
const TEXT_MAX = 4000;
const RETRIES = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const entryFile = (unit) => `${unit.includes('#') ? unit.split('#')[1] : unit}.json`;
const handle = (s) => String(s).trim().replace(/^@/, '');

// One metadata line per ask event: unit, class, event, wait and outcome. Never the ask's text, default or evidence.
export function logAsk(root, rec) {
  try {
    mkdirSync(path.join(root, STATE_DIR), { recursive: true });
    appendFileSync(path.join(root, ASKS_LOG), `${JSON.stringify({ ts: new Date().toISOString(), ...rec })}\n`);
  } catch {
    // the log is best effort
  }
}

// Declared path owners: [{ pattern, owners }] from CODEOWNERS (the first of .github/, the root, docs/).
export function pathOwners(root) {
  const file = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'].map((f) => path.join(root, f)).find((f) => existsSync(f));
  if (!file) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim().split(/\s+/))
    .filter((p) => p.length > 1 && p[0])
    .map(([pattern, ...owners]) => ({ pattern, owners: owners.map(handle).filter(Boolean) }));
}

// The route of an ask: the unit's `Owner-id`, then its parents' (plan, feature), then the owners of the paths in its scope. Deduplicated, in order.
export function routeOf(root, found) {
  const chain = [];
  const parsed = found.parsed;
  const units = [found.step, ...parsed.plans.filter((p) => p.unit === found.step.parent), ...(parsed.feature ? [parsed.feature] : [])];
  for (const u of units) if (u?.ownerId) for (const o of String(u.ownerId).split(/[\s,]+/).filter(Boolean)) chain.push(handle(o));
  const scope = effectiveScope(found.step);
  const byPath = scope.length ? pathOwners(root).filter((r) => scopesOverlap([r.pattern.replace(/^\//, '').replace(/\/$/, '/**')], scope)).flatMap((r) => r.owners) : [];
  return [...new Set([...chain, ...byPath])];
}

// The current branch and the default branch of a worktree, for rebasing when work resumes.
function branchesOf(root) {
  const branch = git(root, ['symbolic-ref', '--short', 'HEAD'], { allowFail: true }) || null;
  const origin = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true });
  const base = origin ? origin.replace(/^origin\//, '') : ['main', 'master'].find((b) => git(root, ['rev-parse', '--verify', '-q', `refs/heads/${b}`], { allowFail: true }));
  return { branch, base: base ?? null };
}

// Reads and checks an ask file (JSON): { what, default, evidence, class, impact? }.
export function readAskFile(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: `${file}: ${e.code === 'ENOENT' ? 'no such file' : 'not valid JSON'}` };
  }
  for (const k of ['what', 'default', 'evidence']) {
    if (typeof data[k] !== 'string' || !data[k].trim()) return { error: `${file}: "${k}" must be a non-empty string` };
    if (data[k].length > TEXT_MAX) return { error: `${file}: "${k}" is longer than ${TEXT_MAX} characters` };
  }
  if (!CLASSES.includes(data.class)) return { error: `${file}: "class" must be one of ${CLASSES.join(', ')}` };
  if (data.impact !== undefined && !IMPACTS.includes(data.impact)) return { error: `${file}: "impact" must be one of ${IMPACTS.join(', ')}` };
  return { ask: { what: data.what.trim(), default: data.default.trim(), evidence: data.evidence.trim(), class: data.class, ...(data.impact ? { impact: data.impact } : {}) } };
}

// ---- park

// Parks the unit `ref` held by `who` on `ask` ({ what, default, evidence, class, impact? }): the worker is released, the claim moves to
// the non-expiring `parked` state without its scope tokens, and the ask is recorded in the entry. { ok, entry, ask } | { ok: false }.
export async function parkAsk(root, ref, who, ask, { now = clockNow(), remote, acceptRemoteLedger = false, route: given } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const kinds = sensitiveKinds([ask]);
  if (kinds.length) return fail('sensitive', `refused: the ask would write ${kinds.join(', ')} to the ledger; remove it first`);
  const settings = claimSettings(root);
  const route = given ?? routeOf(root, found);
  const { branch, base } = branchesOf(root);
  const full = {
    kind: ASK_KIND,
    id: `a-${createHash('sha256').update(`${found.unit}\n${now.toISOString()}\n${who.id}`).digest('hex').slice(0, 8)}`,
    ...ask,
    route,
    level: 0,
    parked: now.toISOString(),
    deadline: new Date(now.getTime() + settings.askTimeoutMs).toISOString(),
    ...(branch ? { branch } : {}),
    ...(base ? { base } : {}),
  };
  const problem = askProblem(full);
  if (problem) return fail('bad-ask', `the ask is not usable: ${problem}`);
  const r = await parkUnit(root, found.unit, who, { ask: full, now, remote, acceptRemoteLedger });
  if (!r.ok) return r;
  logAsk(root, { event: 'parked', unit: found.unit, class: effectiveClass(full), level: 0 });
  return { ok: true, entry: r.entry, ask: full, commit: r.commit };
}

// ---- list

// Units (by `Needs`) that wait on `unit`: a count for ordering and the computed tree.
function waitingOn(root, unit) {
  let n = 0;
  for (const file of activePlanFiles(root)) {
    const plan = parsePlan(readFileSync(path.join(root, file), 'utf8'), file);
    for (const s of plan.steps) if (s.state === 'pending' && s.needs.some((x) => x === unit || x === unit.split('#')[1] || `${stemOf(file)}#${x}` === unit)) n++;
  }
  return n;
}

// Every open ask: parked with a pending answer, or blocked-by-human after its last owner. Oldest first among equals, most blocking first.
// `mine` keeps the asks whose current route (the owners it has reached) names `who`, or whose route is empty.
export function listAsks(root, { who, mine = false, now = clockNow(), remote = null } = {}) {
  const out = [];
  for (const file of activePlanFiles(root)) {
    const stem = stemOf(file);
    for (const e of ledgerView(root, stem, { now, remote }).entries) {
      const open = (e.state === 'parked' && isAsk(e)) || (e.state === 'released' && e.blockedByHuman && isAsk(e));
      if (!open || askProblem(e.ask)) continue;
      const a = e.ask;
      const blocked = e.state === 'released';
      const reached = blocked ? a.route : a.route.slice(0, a.level + 1);
      const routed = !a.route.length || (who && reached.includes(who.id));
      if (mine && !routed) continue;
      out.push({ id: a.id, unit: e.unit, class: effectiveClass(a), level: a.level, owner: blocked ? null : a.route[a.level] ?? null, route: a.route, parked: a.parked, deadline: a.deadline, status: blocked ? 'blocked-by-human' : 'open', waiting: waitingOn(root, e.unit), what: a.what, default: a.default, evidence: a.evidence, routed });
    }
  }
  return out.sort((x, y) => y.waiting - x.waiting || Date.parse(x.parked) - Date.parse(y.parked));
}

export const formatAsk = (a) => `${a.id}  ${a.unit}  ${a.status}  ${a.class}${a.owner ? `  owner ${a.owner}` : ''}  waiting ${a.waiting}  parked ${a.parked}${a.status === 'open' ? `  deadline ${a.deadline}` : ''}\n  ${a.what}\n  default: ${a.default}\n  evidence: ${a.evidence}`;

// ---- transitions

// Replaces the ledger entry of `unit` with `decide(entry)` (an entry, or { error }), retrying a lost push. { ok, entry, previous, commit }.
async function transition(root, unit, who, decide, { now, remote, message, acceptRemoteLedger = false }) {
  const found = findUnit(root, unit);
  if (found.error) return fail('unknown-unit', found.error);
  const { stem } = found;
  const rem = remote === undefined ? remoteOf(root) : remote;
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; nothing was written');
    if (ledger.diverged) return fail('diverged', `the ledger on the remote does not continue the last version this clone saw, so nothing was written; ${ledger.recovery}`);
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, { skewMs: settings.skewMs, maxLeaseMs: settings.leaseMs, nowMs: ctx.nowMs, beatsOf: beatTimes(root, ledger.local ? null : rem, ctx) });
    const previous = entries.find((e) => e.unit === found.unit);
    if (!previous || !isAsk(previous)) return fail('no-ask', `${found.unit} has no parked ask`);
    const next = decide(previous);
    if (next.error) return fail('refused', next.error, next.extra);
    const commit = commitEntries(root, ledger.tip, { [entryFile(found.unit)]: next }, { author: who.id, message: `${message} ${found.unit}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(Math.min(1000, 25 * 2 ** attempt) * (0.5 + Math.random()));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    return { ok: true, entry: next, previous, commit };
  }
  return fail('contended', `${found.unit}: the ledger kept changing; try again`);
}

// Finds an ask by its id or its unit among the open ones: { ask } | { error }.
export function findAsk(root, ref, opts = {}) {
  const asks = listAsks(root, opts).filter((a) => a.id === ref || a.unit === ref || a.unit.split('#')[1] === ref);
  if (asks.length === 1) return { ask: asks[0] };
  return { error: asks.length ? `"${ref}" names more than one open ask; use the ask id` : `no open ask "${ref}"` };
}

// A human on the route answers: `choice` is `default`, `refuse` or the option chosen. The answerer is recorded and the unit goes back to
// `ready` (the entry is released); whoever claims it next re-acquires its scope and rebases the branch (`resumeClaim`).
export async function answerAsk(root, ref, choice, who, { now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  if (who.kind !== 'human') return fail('not-human', 'only a human answers a parked ask (use --kind human)');
  const text = String(choice ?? '').trim();
  if (!text || text.length > 500) return fail('bad-choice', 'the answer must be `default`, `refuse` or a short option (up to 500 characters)');
  const kinds = sensitiveKinds([text]);
  if (kinds.length) return fail('sensitive', `refused: the answer would write ${kinds.join(', ')} to the ledger; remove it first`);
  const open = findAsk(root, ref, { who, now });
  if (open.error) return fail('no-ask', open.error);
  const a = open.ask;
  if (a.route.length && !a.route.includes(who.id)) return fail('not-on-route', `${a.unit}: the ask is routed to ${a.route.join(', ')}; ${who.id} is not on the route`);
  const r = await transition(root, a.unit, who, (e) => {
    const { blockedByHuman, ...rest } = e;
    return { ...rest, state: 'released', scope: [], updated: now.toISOString(), answer: { by: who.id, kind: who.kind, choice: text, at: now.toISOString() } };
  }, { now, remote, message: 'answer', acceptRemoteLedger });
  if (!r.ok) return r;
  logAsk(root, { event: 'answered', unit: a.unit, class: a.class, level: r.previous.ask.level, waitMs: now.getTime() - Date.parse(r.previous.ask.parked), outcome: text === 'default' ? 'default' : text === 'refuse' ? 'refused' : 'chosen' });
  return { ok: true, unit: a.unit, id: a.id, entry: r.entry, commit: r.commit };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The `draft` decision that logs a default taken after a timeout (decision 0155 item 3), written in the working tree for the sweeper to commit.
function writeDraft(root, e, now) {
  const a = e.ask;
  const id = `draft-${slug(e.unit)}-ask-${a.id}`;
  const dir = path.join(root, 'docs', 'decisions');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  const body = `---
id: ${id}
title: Unit ${e.unit} took the recommended default for a parked ask after its timeout
status: draft
date: ${now.toISOString().slice(0, 10)}
tags: [coordination]
track: process
---

## Decision

Pending the owner's review in the digest (procedure \`reviewing-the-daily-digest\`). Unit ${e.unit} asked, nobody on the route answered before ${a.deadline}, and the ask was reversible, so the recommended default was taken (decisions 0155 item 3 and 0168 item 3):

${a.default}

## Why

${a.what}

Evidence: ${a.evidence}

## Tradeoffs considered

- **Wait for an answer:** holds the unit and everything that needs it for as long as nobody answers; the ask was reversible, so the default is cheaper to undo than the wait.
- **Cost accepted:** if the default is rejected in the digest, the work it drove is re-planned.
`;
  writeFileSync(file, body);
  return path.relative(root, file);
}

// Applies the timeout policy of decision 0168 item 3 to every open ask past its deadline (no daemon: `work asks` and callers run it).
// Returns [{ unit, outcome: 'default' | 'escalated' | 'blocked-by-human', draft? }]; a draft decision is written for each default taken.
export async function sweepAsks(root, who, { now = clockNow(), remote, draft = true } = {}) {
  const settings = claimSettings(root);
  const out = [];
  for (const a of listAsks(root, { now }).filter((x) => x.status === 'open' && Date.parse(x.deadline) <= now.getTime())) {
    const at = now.toISOString();
    let outcome;
    const r = await transition(root, a.unit, who, (e) => {
      const ask = e.ask;
      if (effectiveClass(ask) === 'reversible') {
        outcome = 'default';
        return { ...e, state: 'released', scope: [], updated: at, answer: { by: 'timeout', kind: 'ci', choice: 'default', at }, ask: { ...ask, outcome } };
      }
      if (ask.level + 1 < ask.route.length) {
        outcome = 'escalated';
        return { ...e, updated: at, ask: { ...ask, level: ask.level + 1, deadline: new Date(now.getTime() + settings.askTimeoutMs).toISOString() } };
      }
      outcome = 'blocked-by-human';
      return { ...e, state: 'released', scope: [], updated: at, blockedByHuman: true, ask: { ...ask, outcome } };
    }, { now, remote, message: 'time out ask of' });
    if (!r.ok) continue;
    const waitMs = now.getTime() - Date.parse(a.parked);
    logAsk(root, { event: 'timeout', unit: a.unit, class: a.class, level: a.level, waitMs, outcome });
    out.push({ unit: a.unit, outcome, ...(outcome === 'default' && draft ? { draft: writeDraft(root, r.entry, now) } : {}) });
  }
  return out;
}

// ---- resume

// Claims `ref` again after an answer and rebases the branch the parked unit had onto the default branch (decision 0168 item 1). The claim
// re-acquires the scope like any claim (queued when another unit holds it now). { ...claimUnit result, rebase? }.
export async function resumeClaim(root, ref, who, opts = {}) {
  const r = await claimUnit(root, ref, who, opts);
  if (!r.ok || !r.resume?.branch || !r.resume.base) return r;
  return { ...r, rebase: rebaseBranch(root, r.resume.branch, r.resume.base, opts.remote === undefined ? remoteOf(root) : opts.remote) };
}

// Rebases `branch` onto `base` (fetching it first when there is a remote). { ok, note }; a conflict is aborted and reported, never forced.
export function rebaseBranch(root, branch, base, remote) {
  if (!git(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`], { allowFail: true })) return { ok: false, note: `branch ${branch} is not in this repository, so it was not rebased` };
  if (remote) git(root, ['fetch', '-q', remote, base], { allowFail: true });
  const onto = remote && git(root, ['rev-parse', '--verify', '-q', `refs/remotes/${remote}/${base}`], { allowFail: true }) ? `${remote}/${base}` : base;
  const current = git(root, ['symbolic-ref', '--short', 'HEAD'], { allowFail: true });
  if (current !== branch && git(root, ['status', '--porcelain', '--untracked-files=no'], { allowFail: true })) return { ok: false, note: `this worktree has uncommitted changes, so ${branch} was not rebased` };
  const dirty = current !== branch && git(root, ['status', '--porcelain', '--untracked-files=no'], { allowFail: true });
  const run = git(root, ['rebase', onto, branch], { allowFail: true });
  if (git(root, ['rev-parse', '--verify', '-q', 'REBASE_HEAD'], { allowFail: true }) || run === null) {
    git(root, ['rebase', '--abort'], { allowFail: true });
    return { ok: false, note: `rebasing ${branch} onto ${onto} did not apply cleanly (aborted); rebase it by hand` };
  }
  return { ok: true, note: `${branch} rebased onto ${onto}` };
}
