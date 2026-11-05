// Telemetry record schema (guardrail telemetry-records-metadata-only): metadata fields only, anything else is rejected.
// String values are short identifiers so prompt or file content cannot ride along in an allowed field.
const IDENT = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,63}$/;
const ident = (v) => typeof v === 'string' && IDENT.test(v);
// A guardrail id is a lowercase kebab-case slug, the shape of a file name under docs/guardrails/; spaces, quotes and paths fail.
const GUARDRAIL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const count = (v) => Number.isInteger(v) && v >= 0;
const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export const OUTCOMES = ['allowed', 'denied', 'pass', 'fail', 'blocked', 'escalated'];
export const TOKEN_FIELDS = ['input', 'cacheRead', 'cacheWrite', 'output'];
export const COVERAGES = ['lower-bound', 'shared-directory'];
export const MASK_KINDS = ['secret', 'email', 'card', 'iban', 'phone', 'national-id'];

export const FIELDS = {
  ts: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v,
  event: ident,
  host: ident,
  model: ident,
  effort: ident,
  taskClass: ident,
  trigger: ident,
  // The guardrail that caused a denied pre-tool call or a gate stop; optional, so older records stay valid.
  guardrail: (v) => typeof v === 'string' && GUARDRAIL_ID.test(v),
  tokens: (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => TOKEN_FIELDS.includes(k) && count(v[k])),
  cost: num,
  // How far a spend figure can be trusted: a lower bound (part of the usage is not read) or shared with other sessions in the directory.
  coverage: (v) => COVERAGES.includes(v),
  outcome: (v) => OUTCOMES.includes(v),
  escalations: count,
  redactions: count,
  // Counts per kind of what a post-tool event masked (kinds, never content).
  masked: (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, n]) => MASK_KINDS.includes(k) && count(n)),
};

export function validateRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return ['record must be an object'];
  const errors = [];
  for (const [k, v] of Object.entries(record)) {
    if (!(k in FIELDS)) errors.push(`field "${k}" is not an allowed metadata field`);
    else if (!FIELDS[k](v)) errors.push(`field "${k}" has an invalid value`);
  }
  for (const k of ['ts', 'event']) if (!(k in record)) errors.push(`field "${k}" is required`);
  return errors;
}
