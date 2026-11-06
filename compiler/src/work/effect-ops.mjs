// The ledger write behind `go-getter act` (decision 0180 items 5 to 7): check an effect against the grant's caps and every ancestor's, then log it
// as metadata on the holder's entry, or park the unit as an ask when a cap would be passed. Same fast-forward discipline as `recordSpend`.
import { claimSettings, clockNow, entryFile, findUnit, readEntries } from './ops.mjs';
import { commitEntries, fetchLedger, noteLedger, pushRef, readRecord, remoteOf, updateRecord, beatTimes, ledgerRef } from './ledger.mjs';
import { effectOver, effectProblem, effectRecord } from './effects.mjs';

const RETRIES = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

export async function recordEffect(root, ref, who, eff, { action, now = clockNow(), remote, acceptRemoteLedger = false } = {}) {
  const bad = effectProblem(eff);
  if (bad) return fail('bad-effect', bad);
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem } = found;
  const rem = remote === undefined ? readRecord(root).claims?.[unit]?.remote ?? remoteOf(root) : remote;
  const settings = claimSettings(root);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, stem, rem, { accept: acceptRemoteLedger && attempt === 0 });
    if (!ledger.online) return fail('offline', 'the remote could not be reached; the effect was not recorded and not taken');
    if (ledger.diverged) return fail('diverged', ledger.recovery);
    const ctx = { nowMs: now.getTime(), skewMs: settings.skewMs };
    const { entries } = readEntries(root, ledger.tip, { skewMs: settings.skewMs, maxLeaseMs: settings.leaseMs, nowMs: ctx.nowMs, beatsOf: beatTimes(root, ledger.local ? null : rem, ctx) });
    const entry = entries.find((e) => e.unit === unit);
    if (!entry || entry.state === 'released') return fail('not-held', `${unit} has no live claim`);
    if (entry.holder.id !== who.id) return fail('not-holder', `${unit} is held by ${entry.holder.kind} ${entry.holder.id}, not ${who.id}`);
    const over = effectOver(entries, unit, eff, now);
    const next = over
      ? { ...entry, state: 'parked', scope: [], ask: { kind: 'spend', effect: eff.class, unit: over.unit, reason: over.reason }, updated: now.toISOString() }
      : { ...entry, effected: [...(entry.effected ?? []), effectRecord(eff, { unit, holder: who, now, action })], updated: now.toISOString() };
    const message = over ? `park ${unit}: ${eff.class} effect refused by ${over.unit}` : `${eff.class} effect on ${unit}`;
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
      return fail('effect-cap', `${unit}: ${over.reason} (cap of ${over.unit}); not taken, and the unit is parked as an ask of class spend`, { parked: true, over, entry: next });
    }
    return { ok: true, entry: next, record: next.effected.at(-1), commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}
