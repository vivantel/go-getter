// Plan drafting from a one-line goal (decision 0155 item 1, plan throughput T9). A planner runner turns the goal into
// open questions and steps, the unattended interview (T7, defaults.mjs) answers the questions with their recommended
// options, a reviewer runner checks the draft, and the plan is written with `Approval: pending`. Nothing starts until a
// person records the one plan approval (`go-getter plan approve`). The runners are plain functions or shell commands that
// read JSON on stdin and print JSON; the built-in ones are deterministic and make no model call.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parsePlan, PLAN_DIR, approvalOf, APPROVAL } from './plan.mjs';
import { CLASSES } from './verify.mjs';
import { EFFORTS } from './routing/policy.mjs';
import { triggersFor, writeDraft, logStop } from './defaults.mjs';

const MAX_REVIEWS = 2;
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'plan';
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// The built-in planner: a fixed three-step skeleton around the goal. Real planning is a `--planner` runner.
export function defaultPlanner({ goal, project }) {
  const test = (() => {
    try {
      return JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8')).scripts?.test ? 'npm test' : 'true';
    } catch {
      return 'true';
    }
  })();
  return {
    title: oneLine(goal),
    steps: [
      { title: 'Explore the code the goal touches', class: 'explore', parallel: false, needs: [], why: `Find what "${oneLine(goal)}" changes before changing it.`, do: 'List the files, decisions and guardrails the goal touches and write them into this step\'s notes.', doneWhen: 'The files, decisions and guardrails the goal touches are listed.', check: 'true' },
      { title: 'Implement the goal', class: 'implement', needs: ['1'], why: oneLine(goal), do: `Make the change: ${oneLine(goal)}.`, doneWhen: `${oneLine(goal)} works and its tests pass.`, check: test },
      { title: 'Review the change', class: 'review', needs: ['2'], why: 'A fresh context checks the diff against the goal, decisions and guardrails.', do: 'Review the diff against the goal.', doneWhen: 'The review finds nothing blocking.', check: 'true' },
    ],
  };
}

// The built-in reviewer: the structural rules a plan must meet. Returns { ok, problems }.
export function defaultReviewer({ draft }) {
  const problems = [];
  if (!draft.steps?.length) problems.push('the plan has no steps');
  for (const [i, s] of (draft.steps ?? []).entries()) {
    const at = `step ${i + 1}`;
    if (!oneLine(s.title)) problems.push(`${at} has no title`);
    if (!oneLine(s.check)) problems.push(`${at} has no Check`);
    if (!oneLine(s.doneWhen)) problems.push(`${at} has no Done-when`);
    if (!oneLine(s.why)) problems.push(`${at} has no Why`);
    if (s.class && !CLASSES.includes(s.class)) problems.push(`${at} has unknown class "${s.class}"`);
  }
  return { ok: !problems.length, problems };
}

// A runner from a shell command: the request as JSON on stdin, the answer as JSON on stdout.
export function commandRunner(command, cwd) {
  return (request) => {
    const res = spawnSync(command, { cwd, shell: true, input: JSON.stringify(request), encoding: 'utf8', timeout: 10 * 60 * 1000 });
    if (res.status !== 0) throw new Error(`runner "${command}" failed${res.stderr ? `: ${res.stderr.trim().split('\n')[0]}` : ''}`);
    try {
      return JSON.parse(res.stdout);
    } catch {
      throw new Error(`runner "${command}" did not print JSON`);
    }
  };
}

// Takes the recommended option of each open question through the T7 triggers. Returns { defaulted, stopped? }.
function interview(project, questions, { risk = {}, now }) {
  const defaulted = [];
  for (const q of questions ?? []) {
    const rec = (q.options ?? []).find((o) => o.recommended);
    if (!rec) throw new Error(`question "${q.id}" has no recommended option to default to`);
    const triggers = triggersFor(q.id, rec.id, { risk: { ...(q.risk ?? {}), ...(risk[q.id] ?? {}) } });
    if (triggers.length) {
      logStop(project, { pack: 'plan-draft', question: q.id, triggers: triggers.map((t) => ({ trigger: t.trigger, reason: t.reason })) }, now);
      return { defaulted, stopped: { question: q.id, value: rec.id, triggers } };
    }
    const draft = writeDraft(project, { pack: 'plan-draft', question: q.id, value: rec.id, reason: `Recommended option${rec.tradeoff ? `: ${rec.tradeoff}` : '.'}`, now });
    defaulted.push({ question: q.id, value: rec.id, draft });
  }
  return { defaulted };
}

export function renderPlan(draft, { goal, date }) {
  const blocks = draft.steps.map((s, i) => {
    const meta = [`Class: ${s.class ?? 'implement'}`, ...(s.effort && EFFORTS.includes(s.effort) ? [`Effort: ${s.effort}`] : []), `Needs: ${s.needs?.length ? s.needs.join(', ') : 'none'}`, `Check: \`${oneLine(s.check)}\``].join(' · ');
    const files = (s.files ?? []).map(oneLine).filter(Boolean);
    return [`### ${i + 1} ${oneLine(s.title)} — [ ]${s.parallel ? ' ‖' : ''}`, meta, ...(files.length ? [`Files: ${files.join(', ')}`] : []), `Why: ${oneLine(s.why)}`, `Do: ${oneLine(s.do)}`, `Done-when: ${oneLine(s.doneWhen)}`].join('\n');
  });
  return `# ${oneLine(draft.title || goal)} — plan\n\n**Status legend**: \`[ ]\` pending | \`[~]\` in progress | \`[x]\` done | \`[!]\` blocked | \`[>]\` moved to another plan. \`‖\` marks steps that can run in parallel.\n\n**Goal**: ${oneLine(goal)}\n**Drafted**: ${date} by \`go-getter plan draft\`\n**Approval**: pending\n\n${blocks.join('\n\n')}\n`;
}

// Drafts the plan and writes it to docs/plans/<slug>.md; refuses to replace a file. Returns { file, steps, defaulted } or { stopped }.
export async function draftPlan(project, goal, { planner = defaultPlanner, reviewer = defaultReviewer, risk, now = new Date() } = {}) {
  if (!oneLine(goal)) throw new Error('the goal is empty');
  const file = path.join(project, PLAN_DIR, `${slugOf(goal)}.md`);
  if (existsSync(file)) throw new Error(`${path.relative(project, file)} exists; it is not replaced`);
  let draft = await planner({ goal, project });
  const asked = interview(project, draft.questions, { risk, now });
  if (asked.stopped) return { stopped: asked.stopped, defaulted: asked.defaulted };
  const date = now.toISOString().slice(0, 10);
  for (let round = 0; ; round++) {
    const verdict = await reviewer({ goal, draft, project });
    const text = renderPlan(draft, { goal, date });
    const parsed = parsePlan(text, file);
    const problems = [...(verdict.ok ? [] : verdict.problems ?? ['the reviewer refused the draft']), ...parsed.problems, ...parsed.steps.filter((s) => !s.check).map((s) => `step ${s.id} has no Check`)];
    if (!problems.length) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
      return { file, steps: parsed.steps.length, defaulted: asked.defaulted };
    }
    if (round + 1 >= MAX_REVIEWS) throw new Error(`the draft failed review after ${MAX_REVIEWS} rounds: ${problems.join('; ')}`);
    draft = await planner({ goal, project, problems, previous: draft });
  }
}

// --- the one plan approval -------------------------------------------------------------------------------------------

export function approvePlan(file, { by, now = new Date() }) {
  const text = readFileSync(file, 'utf8');
  const a = approvalOf(text);
  if (a.state === 'approved') return { changed: false, text: a.text };
  const line = `approved ${now.toISOString().slice(0, 10)} by ${oneLine(by) || 'unknown'}`;
  if (a.state === 'none') {
    // An existing plan (written by hand, before drafting existed): the person's approval adds the line after the status legend, or the title.
    const lines = text.split('\n');
    const at = Math.max(lines.findIndex((l) => l.startsWith('**Status legend**')), lines.findIndex((l) => l.startsWith('# ')), 0);
    lines.splice(at + 1, 0, `**Approval**: ${line}`);
    writeFileSync(file, lines.join('\n'));
    return { changed: true, text: line };
  }
  writeFileSync(file, text.replace(APPROVAL, `**Approval**: ${line}`));
  return { changed: true, text: line };
}
