// The WorkSource contract (decisions 0117, 0118, 0119): where `plan` gets its steps. A source is `{ id, ops, handle }`;
// the core reaches it only through `callSource`, which holds the rules a helper process would be held to later: a call
// and its answer are plain JSON data (no callbacks, no shared state), an op the source does not list is `unsupported`,
// and nothing a source returns is run as a command.
//
// Ops: list {} -> { steps }; get { id } -> { step }; create { id?, title, class?, needs?, doneWhen? } -> { step } (id is
// required where a source cannot assign one, as the file source cannot; a tracker assigns its own);
// setState { id, state } -> { step }; comment { id, text } -> {}.
// A step is plain data: { id, title, state, parallel, class, needs, fields, check?, doneWhen?, issue?, effort?, tier?, data? }.
// `list` answers with the summary of each step (SUMMARY_KEYS: no `fields`, no bodies); `get` answers with the whole step.
//
// Budgets (decision 0140), held here for every source alike. The initial limits are chosen from the measured size of the
// in-tree sources (this repo's 12 plans, file source, which the GitHub and Jira sources wrap): the longest title is 70
// characters, the longest done-when 906, the most steps in a plan 43, the largest unsummarised `list` answer 50 KB. Each
// limit is about the measured maximum times 3 to 12 so a real plan never reaches it, and a source that does is wrong.
// A GitHub or Jira issue adds a state and a title of at most 120 characters (`cleanTitle`), within the same limits.
import { findings } from '../secrets/patterns.mjs';
import { piiFindings } from '../secrets/pii.mjs';

export const OPS = ['list', 'get', 'create', 'setState', 'comment'];
export const STATES = ['pending', 'in progress', 'done', 'blocked', 'moved'];
export const LIMITS = {
  title: 160, // characters of a step title
  doneWhen: 1200, // characters of a done-when line
  field: 4000, // characters of any other text a step holds, `get`'s fields included
  id: 80, // characters of a step id or a need
  needs: 100, // needs of one step
  listItems: 500, // steps in a `list`; above it the list is unavailable, never partial
  answerBytes: 262144, // bytes of one answer as JSON
  cacheMs: 60000, // how long a network source's read is kept
};
const TEXT_KEY_LIMIT = { title: 'title', doneWhen: 'doneWhen' };
const SUMMARY_KEYS = ['id', 'title', 'state', 'parallel', 'class', 'needs', 'issue', 'doneWhen', 'issueState', 'fileState', 'mismatch'];
export const ERROR_CODES = ['unknown-op', 'unsupported', 'invalid-args', 'unknown-step', 'invalid-plan', 'unavailable'];

// What an answer must hold for its op; anything else is `unavailable`, since a source's data is untrusted.
export function isStep(s) {
  return Boolean(s) && typeof s === 'object' && typeof s.id === 'string' && s.id !== '' && typeof s.title === 'string' && STATES.includes(s.state) && typeof s.parallel === 'boolean' &&
    typeof s.class === 'string' && Array.isArray(s.needs) && s.needs.every((n) => typeof n === 'string') && (s.fields === undefined || (Boolean(s.fields) && typeof s.fields === 'object' && !Array.isArray(s.fields)));
}
const RESULT_OK = {
  list: (r) => Array.isArray(r.steps) && r.steps.every(isStep),
  get: (r) => isStep(r.step),
  create: (r) => isStep(r.step),
  setState: (r) => isStep(r.step),
  comment: () => true,
};

export const ok = (result = {}) => ({ ok: true, result });
export const fail = (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } });

// True when the value is JSON data: null, booleans, finite numbers, strings, arrays and plain objects of those. A Date,
// a function, undefined, a class instance or a cycle is not, since it would not cross a process boundary unchanged.
export function isPlainData(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
  seen.add(value);
  const inner = Object.values(value).every((v) => isPlainData(v, seen));
  seen.delete(value);
  return inner;
}

// Text as an agent may see it: one line, no control characters, secrets and personal data (email, card, IBAN) replaced, cut
// to `max` characters. Returns { text, cut }.
export function cleanText(value, max) {
  let t = String(value ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
  const found = [];
  for (const f of [...findings(t), ...piiFindings(t)]) if (!found.some((g) => f.index < g.index + g.length && g.index < f.index + f.length)) found.push(f);
  for (const f of found.sort((a, b) => b.index - a.index)) t = `${t.slice(0, f.index)}[redacted]${t.slice(f.index + f.length)}`;
  return t.length > max ? { text: `${t.slice(0, max - 1)}…`, cut: true } : { text: t, cut: false };
}

// `value` with every string cleaned, each cut to the limit of its key; `tally.cut` counts the strings that were cut.
function budgetText(value, key, tally) {
  if (typeof value === 'string') {
    const r = cleanText(value, LIMITS[TEXT_KEY_LIMIT[key]] ?? LIMITS.field);
    if (r.cut) tally.cut++;
    return r.text;
  }
  if (Array.isArray(value)) return value.map((v) => budgetText(v, key, tally));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, budgetText(v, k, tally)]));
  return value;
}

const tooLong = (step) => step.id.length > LIMITS.id || step.needs.length > LIMITS.needs || step.needs.some((n) => n.length > LIMITS.id);

// The answer held to the budgets, or null when it breaks one that cannot be cut (then the caller says `unavailable`).
function withBudgets(op, result, tally) {
  const steps = op === 'list' ? result.steps : result.step ? [result.step] : [];
  if (op === 'list' && steps.length > LIMITS.listItems) return null;
  if (steps.some(tooLong)) return null;
  const clean = (s) => budgetText(op === 'list' ? Object.fromEntries(SUMMARY_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) : s, '', tally);
  if (op === 'list') return { ...result, steps: steps.map(clean) };
  if (result.step) return { ...result, step: clean(result.step) };
  return result;
}

// What a network source's reads are kept in, by source; a write through the core clears that source's entry.
const caches = new WeakMap();
const READS = ['list', 'get'];

// The one entry the core uses. Never throws: an error a source raises is `unavailable`. `now` and `cacheMs` serve tests.
export async function callSource(source, op, args = {}, { now = Date.now, cacheMs = LIMITS.cacheMs } = {}) {
  if (!OPS.includes(op)) return fail('unknown-op', `unknown op "${op}"`);
  if (!source.ops.includes(op)) return fail('unsupported', `source "${source.id}" does not support ${op}`);
  if (!args || typeof args !== 'object' || Array.isArray(args) || !isPlainData(args)) return fail('invalid-args', `${op} takes a plain object`);
  const cached = source.network === true;
  const key = `${op}:${JSON.stringify(args)}`;
  if (cached && !READS.includes(op)) caches.delete(source);
  if (cached && READS.includes(op)) {
    const hit = caches.get(source)?.get(key);
    if (hit && now() - hit.at < cacheMs) return JSON.parse(hit.json);
  }
  let answer;
  try {
    answer = await source.handle(op, JSON.parse(JSON.stringify(args)));
  } catch (err) {
    return fail('unavailable', String(err?.message ?? err).split('\n')[0]);
  }
  if (cached && !READS.includes(op)) caches.delete(source);
  if (!answer || typeof answer.ok !== 'boolean' || !isPlainData(answer)) return fail('unavailable', `source "${source.id}" answered ${op} with data that is not plain JSON`);
  if (answer.ok && !(answer.result && typeof answer.result === 'object' && RESULT_OK[op](answer.result))) return fail('unavailable', `source "${source.id}" answered ${op} with a result of the wrong shape`);
  if (!answer.ok && !ERROR_CODES.includes(answer.error?.code)) return fail('unavailable', `source "${source.id}" answered ${op} with an unknown error code`);
  if (!answer.ok) return answer;
  const tally = { cut: 0 };
  const result = withBudgets(op, answer.result, tally);
  if (!result) return fail('unavailable', `source "${source.id}" answered ${op} over its budget (${op === 'list' ? `more than ${LIMITS.listItems} steps` : 'an id or needs too long'}), so it is not reported on`);
  const budgeted = ok(tally.cut ? { ...result, capped: tally.cut } : result);
  if (JSON.stringify(budgeted).length > LIMITS.answerBytes) return fail('unavailable', `source "${source.id}" answered ${op} with more than ${LIMITS.answerBytes} bytes`);
  if (cached && READS.includes(op)) {
    if (!caches.has(source)) caches.set(source, new Map());
    caches.get(source).set(key, { at: now(), json: JSON.stringify(budgeted) });
  }
  return budgeted;
}
