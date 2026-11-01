// Default-and-log (decision 0155): an unattended interview takes each question's recommended option, records it as a `draft`
// decision with the reason, and stops only on one of the four ask-triggers. The question logic stays in interview.mjs;
// this file adds the triggers, the draft artifacts and the stop log the digest reads. Ids, numbers and short reasons only.
import path from 'node:path';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { nextQuestion } from './interview.mjs';
import { nextNumber, setIndexRow } from './render.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { STATE_DIR } from './telemetry/record.mjs';

export const DIGEST_DIR = path.join(STATE_DIR, 'digest');
export const STOPS_LOG = path.join(DIGEST_DIR, 'stops.jsonl');

// The four triggers of decision 0155 item 3.
export const TRIGGERS = {
  'hard-to-reverse': 'a',
  'changes-committed-decision': 'b',
  'data-class-or-security': 'c',
  'spend-over-budget': 'd',
};

// Packs whose every choice touches the data class or security posture.
export const SENSITIVE_PACKS = ['data-policy', 'restricted-data', 'sanitization'];

const same = (a, b) => JSON.stringify([].concat(a ?? []).sort()) === JSON.stringify([].concat(b ?? []).sort());
const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const reasonOf = (v, fallback) => (typeof v === 'string' && v ? v : fallback);

// The triggers a defaulted `value` for `id` would hit. `risk` is what the caller knows about this question
// ({ irreversible, supersedes, dataClass, costUsd }, each a reason string or true); `committed` is the project's recorded
// answers for the pack (null when not adopted); `budgetUsd` and `spentUsd` bound spend (no budget, no spend trigger).
export function triggersFor(id, value, { risk = {}, committed = null, sensitivePack = false, budgetUsd = null, spentUsd = 0 } = {}) {
  const hits = [];
  const add = (trigger, reason) => hits.push({ trigger, letter: TRIGGERS[trigger], reason });
  if (risk.irreversible) add('hard-to-reverse', reasonOf(risk.irreversible, `taking the default for "${id}" is hard to reverse`));
  if (committed && committed[id] !== undefined && !same(committed[id], value)) {
    add('changes-committed-decision', `the default ${JSON.stringify(value)} for "${id}" would change the committed answer ${JSON.stringify(committed[id])}`);
  }
  if (risk.supersedes) add('changes-committed-decision', reasonOf(risk.supersedes, `the default for "${id}" would supersede a committed decision`));
  if (sensitivePack || risk.dataClass) add('data-class-or-security', sensitivePack ? `"${id}" belongs to a pack that sets the data class or security posture` : reasonOf(risk.dataClass, `"${id}" changes the data class or security posture`));
  if (budgetUsd !== null) {
    const next = spentUsd + (typeof risk.costUsd === 'number' ? risk.costUsd : 0);
    if (next > budgetUsd) add('spend-over-budget', `spend $${next} would pass the run budget of $${budgetUsd}`);
  }
  return hits;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Writes the `draft` decision for one defaulted answer and its INDEX row. Returns the artifact id.
export function writeDraft(project, { pack, question, value, reason, now }) {
  const dir = path.join(project, 'docs', 'decisions');
  mkdirSync(dir, { recursive: true });
  const id = `${String(nextNumber(dir)).padStart(4, '0')}-default-${slug(pack)}-${slug(question)}`;
  const shown = Array.isArray(value) ? value.join(', ') : String(value);
  const title = `Default for ${pack}/${question}: ${shown}`;
  const data = {
    id,
    title,
    status: 'draft',
    date: now.toISOString().slice(0, 10),
    tags: ['interview', 'roadmap'],
    track: 'process',
    'go-getter': { defaulted: { at: now.toISOString(), pack, question, option: value } },
  };
  const body = `\n## Decision\n\nFor \`${question}\` of pack \`${pack}\`, take \`${shown}\`.\n\n## Why\n\n${reason}\n\nTaken unattended as the default (decision 0155); review it in the daily digest.\n\nRefs: docs/decisions/0155-human-attention-goes-to-plan-approval-triggers-and-batched-releases.md\n`;
  writeFileSync(path.join(dir, `${id}.md`), stringifyFrontmatter(data, body));
  const index = path.join(dir, 'INDEX.md');
  if (!existsSync(index)) writeFileSync(index, '# Decisions index (CSV)\n\nid,title,tags,status\n');
  setIndexRow(index, id, `${id},${csv(title)},${csv('interview, roadmap')},draft`);
  return id;
}

// Appends a stop to the log the digest reads. Never holds prompt text.
export function logStop(project, entry, now) {
  mkdirSync(path.join(project, DIGEST_DIR), { recursive: true });
  appendFileSync(path.join(project, STOPS_LOG), `${JSON.stringify({ ts: now.toISOString(), ...entry })}\n`);
}

const reasonFor = (view, value) => {
  if (view.options) {
    const o = view.options.find((x) => x.id === value);
    return `Recommended option${o?.tradeoff ? `: ${o.tradeoff}` : '.'}`;
  }
  return 'The detected or default value of the question.';
};

// Runs the pack's remaining questions with their defaults until done or a trigger stops it. Mutates nothing but the files it
// reports. Returns { done, input, defaulted: [{question, value, draft}], stopped?: { question, value, triggers } }.
export function runDefaults({ project, pack, input, advanced = false, risk = {}, committed = null, budgetUsd = null, spentUsd = 0, now = new Date() }) {
  const cur = { ...input, answers: { ...input.answers }, profile: { ...input.profile } };
  const defaulted = [];
  const sensitivePack = SENSITIVE_PACKS.includes(pack.id);
  for (;;) {
    const next = nextQuestion(pack, cur, { advanced });
    if (next.errors) throw new Error(next.errors.join('; '));
    if (next.done) return { done: true, input: cur, defaulted };
    let id;
    let value;
    let reason;
    let inner = [];
    if (next.kind === 'profile') {
      id = next.topic;
      const p = next.profiles.find((x) => x.recommended);
      if (!p) throw new Error(`profile topic "${id}" has no recommended profile to default to`);
      value = p.id;
      reason = `Recommended profile${p.tradeoff ? `: ${p.tradeoff}` : '.'}`;
      // A profile stands for its answers: each is checked against what the project committed to.
      inner = Object.entries(p.answers).flatMap(([qid, v]) => triggersFor(qid, v, { risk: risk[qid], committed, sensitivePack }));
    } else {
      id = next.question.id;
      value = next.question.prefill;
      if (value === undefined) throw new Error(`question "${id}" has no recommended option, detected value or default`);
      reason = reasonFor(next.question, value);
    }
    const triggers = [...triggersFor(id, value, { risk: risk[id], committed: next.kind === 'profile' ? null : committed, sensitivePack, budgetUsd, spentUsd }), ...inner];
    if (triggers.length) {
      logStop(project, { pack: pack.id, question: id, triggers: triggers.map((t) => ({ trigger: t.trigger, reason: t.reason })) }, now);
      return { done: false, input: cur, defaulted, stopped: { question: id, value, triggers } };
    }
    const draft = writeDraft(project, { pack: pack.id, question: id, value, reason, now });
    if (next.kind === 'profile') cur.profile[id] = value;
    else cur.answers[id] = value;
    defaulted.push({ question: id, value, draft });
  }
}
