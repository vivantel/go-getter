// Outcome briefs (decision 0178 item 1): docs/outcomes/<id>.md. A brief is complete when it names its meter, target,
// observation window and attribution method, and every meter it names has a docs/meters/<id>.md file.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

// Frontmatter keys of a brief; the first four are what the guardrail refuses a brief for lacking.
export const REQUIRED = ['meters', 'target', 'window', 'attribution'];
export const FIELDS = ['id', 'title', 'status', 'hypothesis', 'meters', 'target', 'window', 'attribution', 'constraints', 'budget', 'effect-caps', 'review-cadence'];
const METER_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME = { meters: 'meter' };

const filled = (v) => (Array.isArray(v) ? v.some(filled) : v !== undefined && v !== null && String(v).trim() !== '');

export function readOutcomes(root) {
  const dir = path.join(root, 'docs/outcomes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .sort()
    .map((n) => {
      const file = path.join(dir, n);
      const brief = { id: n.slice(0, -3), file: path.relative(root, file), data: {}, body: '' };
      try {
        Object.assign(brief, parseFrontmatter(readFileSync(file, 'utf8')));
      } catch (err) {
        brief.parseError = err.message;
      }
      return brief;
    });
}

// Problems of one brief, each naming the field: `<file>: missing <field>` or `<file>: unknown meter "<id>"`.
export function briefProblems(root, brief) {
  if (brief.parseError) return [`${brief.file}: unreadable frontmatter (${brief.parseError})`];
  const problems = [];
  const d = brief.data ?? {};
  for (const key of REQUIRED) if (!filled(d[key])) problems.push(`${brief.file}: missing ${NAME[key] ?? key}`);
  const meters = Array.isArray(d.meters) ? d.meters : filled(d.meters) ? [d.meters] : [];
  for (const m of meters.map(String)) {
    if (!METER_ID.test(m) || !existsSync(path.join(root, 'docs/meters', `${m}.md`))) problems.push(`${brief.file}: unknown meter "${m}" (no docs/meters/${m}.md)`);
  }
  return problems;
}

export function outcomeProblems(root, id) {
  const briefs = readOutcomes(root);
  const chosen = id ? briefs.filter((b) => b.id === id) : briefs;
  if (id && !chosen.length) return [`no outcome brief docs/outcomes/${id}.md`];
  return chosen.flatMap((b) => briefProblems(root, b));
}
