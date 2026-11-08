// Real-world effects (decision 0180): the action map a project writes in docs/effects.md, and the cap rules over a grant's `effects`. Pure
// functions; the verb that logs an effect against the ledger is `effect-ops.mjs` and the one path to act is `act.mjs`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EFFECT_CLASSES } from './grant.mjs';

export const EFFECTS_FILE = 'docs/effects.md';
const PERIOD_MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };

// The action map: a table of `| action | class | tool |`. A row whose class is not one of the four is dropped, so its action is unmapped (unknown).
export function parseEffects(text) {
  const rows = [];
  let cols = null;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/`/g, ''));
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!cols) {
      cols = cells.map((c) => c.toLowerCase());
      if (!cols.includes('action') || !cols.includes('class')) cols = null;
      continue;
    }
    const at = (name) => cells[cols.indexOf(name)] ?? '';
    if (!at('action') || !EFFECT_CLASSES.includes(at('class'))) continue;
    rows.push({ action: at('action'), class: at('class'), tool: at('tool') });
  }
  return rows;
}

export function readEffects(root) {
  const file = path.join(root, EFFECTS_FILE);
  return existsSync(file) ? parseEffects(readFileSync(file, 'utf8')) : [];
}

// The action's row, or null: an unmapped action has an unknown class and is never taken (decision 0180 items 3 and 4).
export const lookupAction = (rows, action) => rows.find((r) => r.action === action) ?? null;

// Why an effect description is malformed for its class, or null. `eff`: { class, amount, zone, contract, counterparty }.
export function effectProblem(eff) {
  if (!EFFECT_CLASSES.includes(eff?.class)) return `class ${eff?.class} is unknown`;
  if (eff.class === 'money' && !(Number.isFinite(eff.amount) && eff.amount > 0)) return 'a money effect needs --amount, a positive number';
  if (eff.class === 'physical' && !eff.zone) return 'a physical effect needs --zone';
  if (eff.class === 'legal' && !(eff.contract && eff.counterparty)) return 'a legal effect needs --contract and --counterparty';
  return null;
}

// The cap item a physical or legal effect is checked against.
export const capItem = (eff) => (eff.class === 'physical' ? eff.zone : eff.class === 'legal' ? `${eff.contract}@${eff.counterparty}` : null);

// Why one grant's cap does not cover `eff`, or null. Money also counts what was already logged (`used`, inside the period) against the amount.
export function grantRefuses(grant, eff, used = 0) {
  const fx = grant.effects ?? {};
  if (eff.class === 'reversible') return null;
  if (!fx[eff.class]) return `${eff.class} is not granted`;
  if (eff.class === 'money') {
    const { amount, period } = fx.money;
    return used + eff.amount > amount ? `money ${eff.amount} would pass the cap of ${amount}/${period} (${used} used)` : null;
  }
  const item = capItem(eff);
  return fx[eff.class].includes(item) ? null : `${item} is outside the ${eff.class} cap (${fx[eff.class].join(', ')})`;
}

const subtree = (entries, unit) => {
  const seen = new Set([unit]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of entries) if (e.parent && seen.has(e.parent) && !seen.has(e.unit)) (seen.add(e.unit), (grew = true));
  }
  return entries.filter((e) => seen.has(e.unit));
};

// Money logged by a unit and everything below it inside the last `period`.
export function moneyUsed(entries, unit, period, now) {
  const since = now.getTime() - (PERIOD_MS[String(period).toLowerCase()] ?? PERIOD_MS.day);
  return subtree(entries, unit).flatMap((e) => e.effected ?? []).filter((r) => r.class === 'money' && Date.parse(r.at) > since).reduce((n, r) => n + r.amount, 0);
}

// The first unit, from `unit` up through its ancestors, whose grant refuses `eff`: { unit, reason } | null. A non-reversible effect also needs
// at least one grant on the path, so an ungranted unit cannot act. An effect counts against every ancestor's cap (decision 0180 item 6).
export function effectOver(entries, unit, eff, now) {
  const byUnit = new Map(entries.map((e) => [e.unit, e]));
  const seen = new Set();
  let granted = false;
  for (let e = byUnit.get(unit); e && !seen.has(e.unit); e = e.parent ? byUnit.get(e.parent) : null) {
    seen.add(e.unit);
    if (!e.grant) continue;
    granted = true;
    const used = eff.class === 'money' && e.grant.effects?.money ? moneyUsed(entries, e.unit, e.grant.effects.money.period, now) : 0;
    const reason = grantRefuses(e.grant, eff, used);
    if (reason) return { unit: e.unit, reason };
  }
  return granted || eff.class === 'reversible' ? null : { unit, reason: `${unit} has no grant, so no ${eff.class} effect is delegated to it` };
}

// The metadata record of an effect: class, amount or zone, unit, holder. Never content (guardrail telemetry-records-metadata-only).
export function effectRecord(eff, { unit, holder, now, action }) {
  const rec = { class: eff.class, action, unit, holder: holder.id, at: now.toISOString() };
  if (eff.class === 'money') Object.assign(rec, { amount: eff.amount, currency: eff.currency ?? null });
  if (eff.class === 'physical') rec.zone = eff.zone;
  if (eff.class === 'legal') Object.assign(rec, { contract: eff.contract, counterparty: eff.counterparty });
  return rec;
}
