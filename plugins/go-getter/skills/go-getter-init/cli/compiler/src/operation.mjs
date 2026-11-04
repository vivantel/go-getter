// Operating charters (decision 0177 item 3): docs/operations/<id>.md. A charter names the outcome it serves, an owner,
// health meters each with a threshold and a direction, an escalation route and a retirement condition. `status` reads
// each meter's latest reading and reports which thresholds are crossed; it creates no unit (incident and recurring
// units are made by hand until a later step automates them).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { readings } from './measure.mjs';

export const FIELDS = ['id', 'title', 'status', 'outcome', 'owner', 'health', 'escalation', 'retirement'];
export const DIRECTIONS = ['above', 'below'];
const METER_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const filled = (v) => (Array.isArray(v) ? v.some(filled) : v !== undefined && v !== null && String(v).trim() !== '');

export function readCharters(root) {
  const dir = path.join(root, 'docs/operations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .sort()
    .map((n) => {
      const file = path.join(dir, n);
      const charter = { id: n.slice(0, -3), file: path.relative(root, file), data: {}, body: '' };
      try {
        Object.assign(charter, parseFrontmatter(readFileSync(file, 'utf8')));
      } catch (err) {
        charter.parseError = err.message;
      }
      return charter;
    });
}

// The health entries of a charter as {meter, threshold, direction} (fields may be absent or malformed).
export function healthOf(charter) {
  const h = charter.data?.health;
  return (Array.isArray(h) ? h : filled(h) ? [h] : []).map((e) => (e && typeof e === 'object' ? e : { meter: e }));
}

// Problems of one charter, each naming the field: `<file>: missing <field>` or `<file>: unknown meter "<id>"`.
export function charterProblems(root, charter) {
  if (charter.parseError) return [`${charter.file}: unreadable frontmatter (${charter.parseError})`];
  const d = charter.data ?? {};
  const problems = [];
  for (const key of ['outcome', 'owner']) if (!filled(d[key])) problems.push(`${charter.file}: missing ${key}`);
  const health = healthOf(charter).filter((e) => filled(e.meter) || filled(e.threshold) || filled(e.direction));
  if (!health.length) problems.push(`${charter.file}: missing health meter`);
  for (const e of health) {
    const m = String(e.meter ?? '');
    if (!filled(e.meter)) problems.push(`${charter.file}: health entry without a meter`);
    else if (!METER_ID.test(m) || !existsSync(path.join(root, 'docs/meters', `${m}.md`))) problems.push(`${charter.file}: unknown meter "${m}" (no docs/meters/${m}.md)`);
    if (typeof e.threshold !== 'number') problems.push(`${charter.file}: health meter "${m}" needs a numeric threshold`);
    if (!DIRECTIONS.includes(e.direction)) problems.push(`${charter.file}: health meter "${m}" needs a direction (${DIRECTIONS.join(' or ')})`);
  }
  if (!filled(d.escalation)) problems.push(`${charter.file}: missing escalation`);
  if (!filled(d.retirement)) problems.push(`${charter.file}: missing retirement condition`);
  return problems;
}

export function operationProblems(root, id) {
  const all = readCharters(root);
  const chosen = id ? all.filter((c) => c.id === id) : all;
  if (id && !chosen.length) return [`no operating charter docs/operations/${id}.md`];
  return chosen.flatMap((c) => charterProblems(root, c));
}

// One line per health meter: its latest reading and whether the threshold is crossed. Reads local refs only.
export function operationStatus(root, id, opts = { fetch: false }) {
  const all = readCharters(root);
  const chosen = id ? all.filter((c) => c.id === id) : all;
  return chosen.flatMap((c) =>
    c.parseError
      ? [{ charter: c.id, meter: null, state: 'unreadable', note: c.parseError }]
      : healthOf(c)
          .filter((e) => filled(e.meter))
          .map((e) => {
            const meter = String(e.meter);
            const latest = METER_ID.test(meter) ? readings(root, meter, opts).sort((a, b) => a.time.localeCompare(b.time)).at(-1) : undefined;
            const base = { charter: c.id, meter, threshold: e.threshold, direction: e.direction, owner: c.data.owner, escalation: c.data.escalation };
            if (!latest) return { ...base, state: 'no-reading' };
            const { value } = latest;
            if (typeof value !== 'number' || typeof e.threshold !== 'number' || !DIRECTIONS.includes(e.direction)) return { ...base, value, time: latest.time, state: 'not-comparable' };
            const crossed = e.direction === 'above' ? value > e.threshold : value < e.threshold;
            return { ...base, value, time: latest.time, state: crossed ? 'crossed' : 'ok' };
          }),
  );
}
