// The sampled audit (decision 0158 items 2 and 3): `audit pick` chooses about 20% of the merged PRs at random plus every PR the
// reviewer flagged, and writes `audit.json` for the digest; `audit fail` turns a failed audit into a follow-up stub.
// Numbers and ids only: no diff, transcript or file content.
//
// audit.json shape (read by digest.mjs): { prs: [int], flagged: [int] }. `prs` is everything the owner reads (the sample and
// the flagged ones, ascending); `flagged` is the subset the reviewer flagged.
import { samplingRate } from './work/escapes.mjs';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AUDIT_FILE, mergedSince, lastDigest } from './digest.mjs';
import { DIGEST_DIR } from './defaults.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { setIndexRow } from './render.mjs';

export const FLAGGED_FILE = path.join(DIGEST_DIR, 'flagged.json');
export const AUDIT_KINDS = ['check', 'guardrail', 'instruction'];
export const DEFAULT_RATE = 0.2;

const ints = (v) => (Array.isArray(v) ? v.filter(Number.isInteger) : []);
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
function writeJson(project, rel, value) {
  mkdirSync(path.join(project, path.dirname(rel)), { recursive: true });
  writeFileSync(path.join(project, rel), `${JSON.stringify(value, null, 2)}\n`);
}

// PRs the reviewer flagged and no audit pick has consumed yet.
export const flaggedPrs = (project) => ints(readJson(path.join(project, FLAGGED_FILE)).prs);

export function flagPr(project, number) {
  if (!Number.isInteger(number)) return;
  const prs = flaggedPrs(project);
  if (!prs.includes(number)) writeJson(project, FLAGGED_FILE, { prs: [...prs, number].sort((a, b) => a - b) });
}

// A small seeded generator (mulberry32): the same seed gives the same sample.
export function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pure: from the merged PR numbers and the flagged ones, the audit set. The sample is ceil(rate * unflagged) PRs drawn
// without replacement; every flagged PR that merged is added.
export function pickAudit(merged, flagged, { rate = DEFAULT_RATE, seed = Date.now() } = {}) {
  const mergedSet = new Set(merged);
  const flaggedMerged = [...new Set(flagged)].filter((n) => mergedSet.has(n)).sort((a, b) => a - b);
  const pool = merged.filter((n) => !flaggedMerged.includes(n));
  const rand = seededRandom(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sample = shuffled.slice(0, Math.ceil(rate * pool.length));
  return { prs: [...new Set([...sample, ...flaggedMerged])].sort((a, b) => a - b), flagged: flaggedMerged };
}

// Picks from the PRs merged since the last digest (or `since`), writes audit.json, and consumes the flagged PRs it included.
export function auditPick(project, { since, rate, seed, now = new Date(), exec } = {}) {
  const from = since ?? lastDigest(project, now);
  const merged = mergedSince(project, from, { exec });
  if (merged === null) throw new Error('audit pick needs the gh CLI to list merged pull requests');
  const used = rate ?? samplingRate(project, 'step', { base: DEFAULT_RATE, now }); // raised by escapes found a level up (decision 0172 item 4)
  const picked = pickAudit(merged.map((p) => p.number), flaggedPrs(project), { rate: used, ...(seed !== undefined ? { seed } : {}) });
  writeJson(project, AUDIT_FILE, picked);
  const rest = flaggedPrs(project).filter((n) => !picked.flagged.includes(n));
  writeJson(project, FLAGGED_FILE, { prs: rest });
  return { ...picked, merged: merged.length, rate: used, since: from.toISOString() };
}

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Writes the follow-up stub for a failed audit of `pr` and returns its path (relative to the project). Draft status: a person
// finishes it before the next run starts (decision 0158 item 3).
export function auditFail(project, pr, as, { now = new Date() } = {}) {
  if (!Number.isInteger(pr) || pr < 1) throw new Error('audit fail needs a pull request number');
  if (!AUDIT_KINDS.includes(as)) throw new Error(`--as must be one of ${AUDIT_KINDS.join(', ')}`);
  const date = now.toISOString().slice(0, 10);
  const instruction = as === 'instruction';
  const dir = path.join(project, 'docs', instruction ? 'skills' : 'guardrails');
  const id = instruction ? `reviewer-audit-pr-${pr}` : `${as}-audit-pr-${pr}`;
  const rel = path.join('docs', instruction ? 'skills' : 'guardrails', `${id}.md`);
  if (existsSync(path.join(project, rel))) throw new Error(`${rel} already exists`);
  const what = { check: 'a new check', guardrail: 'a new guardrail', instruction: 'a new reviewer instruction' }[as];
  const title = `Follow-up to the failed audit of PR #${pr}: ${what}`;
  const data = instruction
    ? { id, title, status: 'draft', date, tags: ['verification', 'procedural'] }
    : {
        id,
        title,
        status: 'draft',
        date,
        tags: ['verification', 'guardrail'],
        'grounded-in': ['0158-merge-requires-a-gate-stack-and-a-sampled-human-audit'],
        'derivation-note': `PR #${pr} passed the gate stack and failed the owner's audit.`,
        'go-getter': { enforcement: [{ tier: as === 'check' ? 3 : 1, check: 'To be defined' }] },
      };
  const body = `\n## ${instruction ? 'Instruction' : 'Guardrail'}\n\nTo be written: what the gate stack missed in PR #${pr}, stated so ${as === 'check' ? 'a check' : as === 'guardrail' ? 'a guardrail' : 'the reviewer'} catches it next time.\n\nRefs: docs/decisions/0158-merge-requires-a-gate-stack-and-a-sampled-human-audit.md\n`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(project, rel), stringifyFrontmatter(data, body));
  const index = path.join(dir, 'INDEX.md');
  if (!existsSync(index)) writeFileSync(index, `# ${instruction ? 'Skills' : 'Guardrails'} index (CSV)\n\nid,title,tags,status\n`);
  setIndexRow(index, id, `${id},${csv(title)},${csv(data.tags.join(', '))},draft`);
  return rel;
}
