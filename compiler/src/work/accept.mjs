// Acceptance (decision 0172): a unit with an `Accept` is not done until a worker who never held it or any descendant has run the check on the
// merged result and passed it. The result is a record in the feature's claims ledger (`<id>.accept.json`), authored by the accepter; the
// ledger's history is never rewritten, so a released unit keeps its holders and the author check holds after release. Worker ids are
// self-declared until claims are signed: this stops mistakes, not a worker who lies about who they are.
import { spawnSync } from 'node:child_process';
import { activePlanFiles, parsePlan, setStepMarker, stemOf } from '../plan.mjs';
import { briefOf, briefVersion, sensitiveKinds } from './claim.mjs';
import { ACCEPT_SUFFIX, cachedLedger, commitEntries, fetchLedger, git, ledgerRef, noteLedger, pushRef, readHistory, remoteOf } from './ledger.mjs';
import { clockNow, findUnit } from './ops.mjs';
import { descendants } from './lifecycle.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 10 * 60_000;
const TAIL = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const acceptFile = (unit) => `${unit.includes('#') ? unit.split('#')[1] : unit}${ACCEPT_SUFFIX}`;

// An `Accept` that names a person or a meter rather than a command cannot be run here.
export const isCommand = (accept) => Boolean(accept) && !/^(human|person|review|meter|outcome)\b/i.test(accept.trim());

// Every worker id that held `unit` or a descendant in the ledger's whole history, released or not: { ids, family }.
export function holdersOf(root, found, tip) {
  const history = readHistory(root, tip);
  const entries = history.flatMap(({ versions }) => versions.map((v) => v.entry).filter(Boolean));
  const family = new Set([found.unit, ...descendants(found, entries)]);
  const ids = new Set();
  for (const e of entries) if (family.has(e.unit) && e.holder?.id) ids.add(e.holder.id);
  return { ids, family };
}

// The latest acceptance of `unit` at `tip`: { rec, valid } or null. Valid: written by the accepter it names, for the unit's current brief.
export function readAcceptance(root, tip, unit, brief) {
  if (!tip) return null;
  const file = acceptFile(unit);
  const body = git(root, ['show', `${tip}:${file}`], { allowFail: true });
  if (!body) return null;
  const author = git(root, ['log', '-1', '--format=%an', tip, '--', file], { allowFail: true });
  try {
    const rec = JSON.parse(body);
    return { rec, valid: rec.unit === unit && rec.by?.id === author && rec.brief === briefVersion(brief) };
  } catch {
    return null;
  }
}

// { state: 'none' | 'failed' | 'passed', rec? } from the last ledger seen (no network). A stale or forged record is `none`.
export function acceptanceState(root, found) {
  const tip = cachedLedger(root, found.stem);
  const got = readAcceptance(root, tip, found.unit, briefOf(found.step));
  if (!got?.valid) return { state: 'none' };
  return { state: got.rec.ok ? 'passed' : 'failed', rec: got.rec };
}

// Whether `plan done <id>` may mark the step: a step whose `Accept` has not passed is refused (decision 0172 item 2).
export function doneGate(root, file, id) {
  const rel = path.relative(root, file);
  const parsed = parsePlan(readFileSync(file, 'utf8'), rel);
  const step = parsed.steps.find((s) => s.id === id);
  if (!step?.accept) return { ok: true };
  const found = findUnit(root, `${stemOf(rel)}#${id}`);
  if (found.error) return { ok: true };
  const s = acceptanceState(root, found);
  return s.state === 'passed' ? { ok: true } : { ok: false, reason: `step ${id} has an Accept (${step.accept}) that ${s.state === 'failed' ? 'failed' : 'has not passed'}; another worker runs go-getter work accept ${found.unit}` };
}

// Units marked done that still lack a passing acceptance: [{ unit, why }]. Plans and features count when all their steps are done.
export function unaccepted(root) {
  const out = [];
  for (const file of activePlanFiles(root)) {
    const parsed = parsePlan(readFileSync(path.join(root, file), 'utf8'), file);
    const settled = (steps) => steps.length > 0 && steps.every((s) => s.state === 'done' || s.state === 'moved');
    const candidates = [
      ...parsed.steps.filter((s) => s.state === 'done'),
      ...parsed.plans.filter((p) => p.unit && settled(p.steps)),
      ...(parsed.feature?.unit && settled(parsed.steps) ? [parsed.feature] : []),
    ].filter((u) => u.accept && u.unit);
    for (const u of candidates) {
      const found = findUnit(root, u.unit);
      if (found.error) continue;
      const s = acceptanceState(root, found);
      if (s.state !== 'passed') out.push({ unit: u.unit, why: s.state === 'failed' ? 'its acceptance failed' : 'no passing acceptance' });
    }
  }
  return out;
}

const tail = (text) => String(text ?? '').trim().split('\n').slice(-TAIL).join('\n');

// Masks evidence that holds a secret or personal data (the ledger is shared; the pull-request scan does not see refs).
const safe = (text) => {
  const kinds = sensitiveKinds(text);
  return kinds.length ? `[withheld: the output held ${kinds.join(', ')}]` : text;
};

// Runs `command` in `root`; { ok, exit, output }.
function runCommand(command, root, input) {
  const res = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: TIMEOUT_MS, ...(input !== undefined ? { input } : {}) });
  return { ok: res.status === 0, exit: res.status ?? (res.error ? -1 : null), output: tail(`${res.stdout ?? ''}\n${res.stderr ?? ''}${res.error ? `\n${res.error.message}` : ''}`) };
}

// `work accept <unit>`: refuse the unit's own holders; run `Accept` on the checkout in `root` (the merged result); give `reviewer`, a
// command, only the brief and the result on stdin and no transcript; record the outcome. A pass marks a step done; a failure records the
// evidence, which the unit's holder sees on their next claim or `plan status`, and leaves the unit not done.
// { ok, passed, rec } | { ok: false, code, error }.
export async function acceptUnit(root, ref, who, { reviewer, now = clockNow(), remote } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem, step } = found;
  const accept = step.accept;
  if (!accept) return fail('no-accept', `${unit} has no Accept to run`);
  if (!isCommand(accept)) return fail('not-a-command', `${unit}: Accept "${accept}" names a person or a meter, which this verb does not run`);
  const rem = remote === undefined ? remoteOf(root) : remote;
  const ledger = fetchLedger(root, stem, rem);
  if (!ledger.online) return fail('offline', 'the remote could not be reached; the holders of the unit cannot be checked');
  if (ledger.diverged) return fail('diverged', `the ledger on the remote does not continue the last version this clone saw; ${ledger.recovery}`);
  const { ids } = holdersOf(root, found, ledger.tip);
  if (ids.has(who.id)) return fail('author', `${who.id} held ${unit} or one of its parts, so another worker runs its Accept (decision 0172 item 2)`);
  const brief = briefOf(step);
  const ran = runCommand(accept, root);
  let review = null;
  if (reviewer) {
    // a fresh context: the brief and the result, nothing of how the work was done
    const r = runCommand(reviewer, root, JSON.stringify({ brief, result: { command: accept, exit: ran.exit, output: ran.output } }));
    review = { ok: r.ok, notes: safe(r.output) };
  }
  const passed = ran.ok && (!review || review.ok);
  const rec = { unit, by: { kind: who.kind, id: who.id }, ok: passed, command: accept, exit: ran.exit, evidence: safe(ran.output), reviewer: review, brief: briefVersion(brief), accepted: now.toISOString() };
  for (let attempt = 0; attempt < 8; attempt++) {
    const l = attempt === 0 ? ledger : fetchLedger(root, stem, rem);
    if (!l.online) return fail('offline', 'the remote could not be reached; the result was not recorded');
    const commit = commitEntries(root, l.tip, { [acceptFile(unit)]: rec }, { author: who.id, message: `accept ${unit} by ${who.kind} ${who.id}: ${passed ? 'pass' : 'fail'}`, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, l.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(25 * 2 ** attempt);
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    if (passed && step.kind === undefined && step.marker !== undefined) setStepMarker(path.join(root, found.file), step.id, 'x');
    return { ok: true, passed, rec, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}
