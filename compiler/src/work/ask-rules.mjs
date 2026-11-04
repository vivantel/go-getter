// The rules of a parked ask (decision 0168), as pure functions over ledger entries. `claim.mjs` uses them to decide which versions of
// a parked entry are valid; `asks.mjs` reads and writes the ledger.
export const ASK_KIND = 'parked-ask';
export const CLASSES = ['reversible', 'irreversible'];
export const IMPACTS = ['decision', 'data', 'security', 'spend'];

// A change to a committed decision, a data-class or security impact or spend over budget never proceeds on timeout (item 3), whatever
// class the owner gave the ask.
export const effectiveClass = (ask) => (ask?.impact ? 'irreversible' : ask?.class);

export const isAsk = (e) => e?.ask?.kind === ASK_KIND;

// Why a parked ask's shape is wrong, or null.
export function askProblem(ask) {
  if (!ask || ask.kind !== ASK_KIND) return 'not a parked ask';
  if (!CLASSES.includes(ask.class)) return `class must be one of ${CLASSES.join(', ')}`;
  if (ask.impact !== undefined && !IMPACTS.includes(ask.impact)) return `impact must be one of ${IMPACTS.join(', ')}`;
  for (const k of ['what', 'default', 'evidence']) if (typeof ask[k] !== 'string' || !ask[k].trim()) return `${k} is empty`;
  if (!Array.isArray(ask.route) || !Number.isInteger(ask.level) || ask.level < 0) return 'no route or level';
  if (Number.isNaN(Date.parse(ask.parked)) || Number.isNaN(Date.parse(ask.deadline))) return 'parked and deadline must be times';
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keepsAsk = (a, b) => ['id', 'class', 'impact', 'what', 'default', 'evidence', 'route', 'parked', 'branch', 'base'].every((k) => same(a[k], b[k]));

// The step from `prev` to `next`, written by `author`, when it is one a parked ask allows without being the holder or issuer, or null:
//   'answer'    the answerer (a human) releases the unit, recorded under their identity
//   'escalate'  an irreversible ask past its deadline moves one owner up the route
//   'default'   a reversible ask past its deadline takes the recommended default
//   'blocked'   an irreversible ask past its deadline and the last owner is released and marked blocked-by-human
// A blocked unit can still be answered.
export function askStep(prev, next, author) {
  if (!prev || !next || prev.unit !== next.unit || !same(prev.holder, next.holder) || !same(prev.issuer, next.issuer) || next.scope.length) return null;
  const waiting = prev.state === 'parked' && isAsk(prev) && !askProblem(prev.ask);
  const blocked = prev.state === 'released' && prev.blockedByHuman && isAsk(prev);
  if (!waiting && !blocked) return null;
  if (next.state === 'released' && next.answer?.by === author && next.answer.kind === 'human' && typeof next.answer.choice === 'string' && next.answer.choice && !next.blockedByHuman && isAsk(next) && keepsAsk(prev.ask, next.ask)) return 'answer';
  if (!waiting || !isAsk(next) || !keepsAsk(prev.ask, next.ask) || !(Date.parse(next.updated) >= Date.parse(prev.ask.deadline))) return null;
  const last = prev.ask.level + 1 >= prev.ask.route.length;
  if (effectiveClass(prev.ask) === 'reversible') return next.state === 'released' && next.answer?.by === 'timeout' && next.answer.choice === 'default' ? 'default' : null;
  if (next.state === 'parked' && !last && next.ask.level === prev.ask.level + 1 && Date.parse(next.ask.deadline) > Date.parse(next.updated)) return 'escalate';
  if (next.state === 'released' && last && next.blockedByHuman && !next.answer) return 'blocked';
  return null;
}
