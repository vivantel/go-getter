// Grants (decisions 0171 and 0180): the authority a unit carries, as a field of its entry in the claims ledger. Pure rules over entries and
// the workers file; the verbs that write grants and spend are `grant-ops.mjs`. A grant only narrows down the delegation tree: every reader of
// the ledger re-runs `applyGrants` and ignores an entry that fails it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isApprovable } from '../gate.mjs';
import { KINDS } from './claim.mjs';
import { scopeTokens, uncovered } from './scope.mjs';

export const WORKERS_FILE = 'docs/workers.md';
// Command shapes no grant carries (decision 0130 item 4, 0159 item 2, 0171 item 4): a person acts each time.
export const ALWAYS_HUMAN = ['force-push', 'history-rewrite', 'branch-delete', 'repo-settings', 'branch-protection', 'tag', 'release', 'publish'];
// Ask policies, narrowest first (decision 0168, 0159): `all` asks a person at every trigger, `default-reversible` lets a reversible ask take
// its default after the timeout, `unrecoverable-only` asks only before something unrecoverable.
export const ASK_POLICIES = ['all', 'default-reversible', 'unrecoverable-only'];
export const EFFECT_CLASSES = ['reversible', 'money', 'physical', 'legal'];
export const DIMENSIONS = ['scope', 'spend', 'shapes', 'asks', 'data', 'effects'];

const uniq = (list) => [...new Set((list ?? []).map((x) => String(x).trim()).filter(Boolean))].sort();
const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x);
const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// ---- the workers file: a table of `| id | tracker | kind | tags |`, one row per worker (kind human, agent or ci)

export function parseWorkers(text) {
  const rows = [];
  let cols = null;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/`/g, ''));
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!cols) {
      cols = cells.map((c) => c.toLowerCase());
      if (!cols.includes('id') || !cols.includes('kind')) cols = null;
      continue;
    }
    const at = (name) => cells[cols.indexOf(name)] ?? '';
    if (!at('id') || !KINDS.includes(at('kind'))) continue;
    rows.push({ id: at('id'), tracker: at('tracker'), kind: at('kind'), tags: at('tags').split(/[,\s]+/).filter(Boolean) });
  }
  return rows;
}

export function readWorkers(root) {
  const file = path.join(root, WORKERS_FILE);
  return existsSync(file) ? parseWorkers(readFileSync(file, 'utf8')) : [];
}

// The ids listed with kind `human`.
export const humanIds = (root) => new Set(readWorkers(root).filter((w) => w.kind === 'human').map((w) => w.id));

// ---- the language of a grant

// A grant from the verb's flag values (strings): { grant } or { error }.
export function parseGrant({ scope, spend, shapes, asks, data, effects } = {}) {
  const list = (v) => uniq(String(v ?? '').split(','));
  if (scope === undefined || spend === undefined || shapes === undefined || asks === undefined || data === undefined) return { error: 'a grant needs --scope, --spend, --shapes, --asks and --data (--effects is optional)' };
  const fx = {};
  for (const item of list(effects)) {
    const [cls, ...rest] = item.split(':');
    const value = rest.join(':');
    if (!EFFECT_CLASSES.includes(cls)) return { error: `effect "${cls}" is not one of ${EFFECT_CLASSES.join(', ')}; an unknown class is never granted (decision 0180 item 3)` };
    if (cls === 'reversible') fx.reversible = true;
    else if (cls === 'money') {
      const m = /^(\d+(?:\.\d+)?)\/([A-Za-z]+)$/.exec(value);
      if (!m) return { error: 'a money effect needs a cap as an amount and period, e.g. money:50/day (decision 0180 item 2)' };
      fx.money = { amount: Number(m[1]), period: m[2] };
    } else {
      const items = uniq(value.split('+'));
      if (!items.length) return { error: `a ${cls} effect needs its cap: ${cls === 'physical' ? 'physical:zoneA+zoneB' : 'legal:<contract>@<counterparty>+...'}` };
      fx[cls] = items;
    }
  }
  const grant = { scope: scopeTokens(list(scope)), spend: Number(spend), shapes: list(shapes), asks: String(asks).trim(), data: list(data), effects: fx };
  return { grant };
}

// Why a grant is malformed, or null.
export function grantShapeProblem(g) {
  if (!g || typeof g !== 'object') return 'grant is not an object';
  if (!isList(g.scope)) return 'scope is not a list';
  if (!num(g.spend)) return 'spend is not a number';
  if (!isList(g.shapes)) return 'shapes is not a list';
  if (!ASK_POLICIES.includes(g.asks)) return `asks must be one of ${ASK_POLICIES.join(', ')}`;
  if (!isList(g.data)) return 'data is not a list';
  const fx = g.effects;
  if (!fx || typeof fx !== 'object' || Array.isArray(fx)) return 'effects is not an object';
  for (const [k, v] of Object.entries(fx)) {
    if (!EFFECT_CLASSES.includes(k)) return `effect class ${k} is unknown`;
    if (k === 'reversible' && v !== true) return 'reversible must be true';
    if (k === 'money' && !(v && num(v.amount) && typeof v.period === 'string' && v.period)) return 'money needs an amount and a period';
    if ((k === 'physical' || k === 'legal') && !(isList(v) && v.length)) return `${k} needs a non-empty cap list`;
  }
  return null;
}

// Why a grant carries what no grant may (the always-human list, a shape that cannot be granted), or null.
export function neverDelegable(g) {
  for (const s of g.shapes) {
    if (ALWAYS_HUMAN.includes(s)) return `shape ${s} is always done by a human and is never delegated`;
    if (!isApprovable(s)) return `shape ${s} is not a command shape that can be granted`;
  }
  return null;
}

const subsetOf = (child, parent) => child.filter((x) => !parent.includes(x));

// The ways `child` is not a subset of `parent`, one text per dimension that is wider: [].
export function subsetProblems(child, parent) {
  const out = [];
  const bad = uncovered(parent.scope, child.scope);
  if (bad) out.push(`scope: ${bad} is outside the parent's scope`);
  if (child.spend > parent.spend) out.push(`spend: ${child.spend} is more than the parent's cap ${parent.spend}`);
  const shapes = subsetOf(child.shapes, parent.shapes);
  if (shapes.length) out.push(`shapes: ${shapes.join(', ')} not granted to the parent`);
  if (ASK_POLICIES.indexOf(child.asks) > ASK_POLICIES.indexOf(parent.asks)) out.push(`asks: ${child.asks} asks a person less often than the parent's ${parent.asks}`);
  const data = subsetOf(child.data, parent.data);
  if (data.length) out.push(`data: ${data.join(', ')} not granted to the parent`);
  const cf = child.effects;
  const pf = parent.effects;
  if (cf.reversible && !pf.reversible) out.push('effects: reversible is not granted to the parent');
  if (cf.money) {
    if (!pf.money) out.push('effects: money is not granted to the parent');
    else if (cf.money.period !== pf.money.period || cf.money.amount > pf.money.amount) out.push(`effects: money ${cf.money.amount}/${cf.money.period} is not within the parent's ${pf.money.amount}/${pf.money.period}`);
  }
  for (const cls of ['physical', 'legal']) {
    if (!cf[cls]) continue;
    const extra = subsetOf(cf[cls], pf[cls] ?? []);
    if (extra.length) out.push(`effects: ${cls} ${extra.join(', ')} is outside the parent's cap`);
  }
  return out;
}

// ---- readers

// What every reader of a ledger does with its entries (decision 0171 items 2 and 6): an entry with a grant stays only when the grant is
// well formed and carries nothing that is never delegable, its creating commit was authored by its issuer, and either
//   - its parent unit's entry has a grant that stays, the issuer holds or issued that parent entry or is a listed human, and the grant is
//     a subset of the parent's on every dimension; or
//   - it has no parent entry with a grant (a root), the issuer is of kind human and listed with kind human in docs/workers.md. This is
//     advisory: an agent using a human's credentials passes it.
// Entries without a grant are not judged. `authors`: unit -> author of the commit that created the entry's grant; `humans`: a Set of ids;
// `parentOf(unit)`: an entry of another feature's ledger that already passed, or null. Returns { entries, ignored: [{ unit, reason }] }.
export function applyGrants(entries, { authors = new Map(), humans = new Set(), parentOf = () => null } = {}) {
  const byUnit = new Map(entries.map((e) => [e.unit, e]));
  const memo = new Map();
  const verdict = (e, trail = []) => {
    if (!e.grant) return null;
    if (memo.has(e.unit)) return memo.get(e.unit);
    if (trail.includes(e.unit)) return 'its parents form a cycle';
    memo.set(e.unit, null);
    const why = judge(e, [...trail, e.unit]);
    memo.set(e.unit, why);
    return why;
  };
  const judge = (e, trail) => {
    const g = e.grant;
    const problem = grantShapeProblem(g) ?? neverDelegable(g);
    if (problem) return problem;
    if (authors.get(e.unit) !== e.issuer.id) return `the grant was written by ${authors.get(e.unit) ?? 'someone'}, not by its issuer ${e.issuer.id}`;
    const inside = e.parent ? byUnit.get(e.parent) : null;
    const outside = e.parent && !inside ? parentOf(e.parent) : null;
    const parent = inside ?? outside;
    if (parent?.grant) {
      if (inside && verdict(inside, trail)) return `the grant of its parent ${inside.unit} is ignored`;
      if (![parent.holder.id, parent.issuer.id].includes(e.issuer.id) && !humans.has(e.issuer.id)) return `${e.issuer.id} neither holds nor issued the parent ${parent.unit}, so cannot delegate from it`;
      const wider = subsetProblems(g, parent.grant);
      return wider.length ? `wider than its parent ${parent.unit}: ${wider.join('; ')}` : null;
    }
    if (e.issuer.kind !== 'human' || !humans.has(e.issuer.id)) return `a root grant must come from a worker of kind human listed in ${WORKERS_FILE}; ${e.issuer.id} is not`;
    return null;
  };
  const ignored = [];
  const kept = entries.filter((e) => {
    const why = verdict(e);
    if (why) ignored.push({ unit: e.unit, reason: `grant: ${why}` });
    return !why;
  });
  return { entries: kept, ignored };
}

// ---- spend

const descendants = (entries, unit) => {
  const out = [];
  const seen = new Set([unit]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of entries) if (e.parent && seen.has(e.parent) && !seen.has(e.unit)) (seen.add(e.unit), out.push(e), (grew = true));
  }
  return out;
};

// What a unit and everything below it have spent.
export function subtreeSpend(entries, unit) {
  const self = entries.find((e) => e.unit === unit);
  return (self?.spent ?? 0) + descendants(entries, unit).reduce((n, e) => n + (e.spent ?? 0), 0);
}

// The first unit, from `unit` up through its ancestors, whose cap `amount` more would pass: { unit, cap, spent } | null. A unit's spend counts
// against every ancestor's cap (decision 0171 item 5).
export function spendOver(entries, unit, amount) {
  const byUnit = new Map(entries.map((e) => [e.unit, e]));
  const seen = new Set();
  for (let e = byUnit.get(unit); e && !seen.has(e.unit); e = e.parent ? byUnit.get(e.parent) : null) {
    seen.add(e.unit);
    if (!e.grant) continue;
    const spent = subtreeSpend(entries, e.unit);
    if (spent + amount > e.grant.spend) return { unit: e.unit, cap: e.grant.spend, spent };
  }
  return null;
}

// The CODEOWNERS file `go-getter apply` generates (decision 0171 item 6): a change to the workers file needs a review by a listed human, named
// by tracker login. Null when no human has a login, so no file is written.
export function codeowners(root) {
  const logins = [...new Set(readWorkers(root).filter((w) => w.kind === 'human' && /^@?[A-Za-z0-9][A-Za-z0-9-]*(\/[A-Za-z0-9._-]+)?$/.test(w.tracker)).map((w) => `@${w.tracker.replace(/^@/, '')}`))];
  return logins.length ? `# Generated by go-getter apply; do not edit.\n# The workers file says who may issue a root grant, so a human listed in it reviews every change to it.\n/${WORKERS_FILE} ${logins.join(' ')}\n` : null;
}
