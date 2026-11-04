// The verbs behind `go-getter work grant` and `work spend` (decisions 0171 and 0180): issue a grant as a field of a unit's entry in the claims
// ledger, and record spend on it. The rules are `grant.mjs`; every write is a fast-forward of the ledger just read.
import { claimSettings, claimUnit, clockNow, findUnit, otherLedgerEntry, readEntries } from './ops.mjs';
import { commitEntries, fetchLedger, noteLedger, pushRef, readRecord, remoteOf, updateRecord, beatTimes, ledgerRef } from './ledger.mjs';
import { grantShapeProblem, humanIds, neverDelegable, spendOver, subsetProblems } from './grant.mjs';

const RETRIES = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const fullRef = (ref, stem) => (ref.includes('#') || ref === stem ? ref : `${stem}#${ref}`);
const entryFile = (unit) => `${unit.includes('#') ? unit.split('#')[1] : unit}.json`;

// Issues `grant` for `ref` to `to` (default the issuer) and records it with the issuer. Refuses a grant that carries an always-human shape or an
// unknown effect class, that is wider than the parent unit's grant on any dimension, or whose issuer neither holds the parent nor (for a root) is
// a human listed in docs/workers.md. The entry is written by the issuer, so readers can tie the grant to them.
export async function issueGrant(root, ref, issuer, { grant, to = issuer, parent, ...rest } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const problem = grantShapeProblem(grant) ?? neverDelegable(grant);
  if (problem) return fail('never-delegable', `refused: ${problem}`);
  const { unit, stem, step } = found;
  const parentUnit = parent ? fullRef(parent, stem) : step.parent ? fullRef(step.parent, stem) : null;
  const now = rest.now ?? clockNow();
  const settings = claimSettings(root);
  const rem = rest.remote === undefined ? remoteOf(root) : rest.remote;
  const ledger = fetchLedger(root, stem, rem);
  if (!ledger.online) return fail('offline', 'the remote could not be reached; a grant needs it (no grant was issued)');
  const tip = ledger.diverged ? null : ledger.tip;
  const view = tip ? readEntries(root, tip, { skewMs: settings.skewMs, maxLeaseMs: settings.leaseMs, nowMs: now.getTime(), beatsOf: beatTimes(root, ledger.local ? null : rem, { nowMs: now.getTime(), skewMs: settings.skewMs }) }).entries : [];
  const up = parentUnit ? view.find((e) => e.unit === parentUnit) ?? otherLedgerEntry(root, parentUnit, {}) : null;
  const humans = humanIds(root);
  if (up?.grant && up.state !== 'released') {
    if (![up.holder.id, up.issuer.id].includes(issuer.id) && !humans.has(issuer.id)) return fail('not-issuer', `refused: ${issuer.id} neither holds nor issued ${up.unit}, so cannot delegate from it`);
    const wider = subsetProblems(grant, up.grant);
    if (wider.length) return fail('wider', `refused: the grant is wider than ${up.unit}'s on ${wider.map((w) => w.split(':')[0]).join(', ')}: ${wider.join('; ')}`, { wider });
  } else if (issuer.kind !== 'human' || !humans.has(issuer.id)) {
    return fail('not-human', `refused: ${unit} has no parent grant, so its grant is a root grant, written only by a worker of kind human listed in docs/workers.md; ${issuer.id} is not (decision 0171 item 6)`);
  }
  return claimUnit(root, ref, to, { ...rest, now, remote: rem, issuer, parent, grant, author: issuer.id, delegator: issuer });
}

// Records `amount` spent by the holder on `ref`. The unit's spend counts against its own cap and every ancestor's, computed from the entries
// of the ledger just read; one that would pass a cap is not recorded and parks the unit as an ask of class spend (decision 0168 item 3).
export async function recordSpend(root, ref, who, amount, { now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  if (!(amount > 0) || !Number.isFinite(amount)) return fail('bad-amount', 'the amount must be a positive number');
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem } = found;
  const rem = remote === undefined ? readRecord(root).claims?.[unit]?.remote ?? remoteOf(root) : remote;
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; the spend was not recorded');
    if (ledger.diverged) return fail('diverged', ledger.recovery);
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, { skewMs: settings.skewMs, maxLeaseMs: settings.leaseMs, nowMs: ctx.nowMs, beatsOf: beatTimes(root, ledger.local ? null : rem, ctx) });
    const entry = entries.find((e) => e.unit === unit);
    if (!entry || entry.state === 'released') return fail('not-held', `${unit} has no live claim`);
    if (entry.holder.id !== who.id) return fail('not-holder', `${unit} is held by ${entry.holder.kind} ${entry.holder.id}, not ${who.id}`);
    const over = spendOver(entries, unit, amount);
    const next = over
      ? { ...entry, state: 'parked', scope: [], ask: { kind: 'spend', cap: over.cap, spent: over.spent, amount, unit: over.unit }, updated: now.toISOString() }
      : { ...entry, spent: (entry.spent ?? 0) + amount, updated: now.toISOString() };
    const message = over ? `park ${unit}: spend ${amount} would pass the cap of ${over.unit}` : `spend ${amount} on ${unit}`;
    const commit = commitEntries(root, ledger.tip, { [entryFile(unit)]: next }, { author: who.id, message, now });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(Math.min(1000, 25 * 2 ** attempt) * (0.5 + Math.random()));
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    if (over) {
      updateRecord(root, (r) => delete r.claims[unit]);
      return fail('spend-cap', `${unit}: ${amount} more would pass the spend cap of ${over.unit} (${over.spent} of ${over.cap} spent); not recorded, and the unit is parked as an ask of class spend`, { parked: true, over, entry: next });
    }
    return { ok: true, entry: next, spent: next.spent, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}
