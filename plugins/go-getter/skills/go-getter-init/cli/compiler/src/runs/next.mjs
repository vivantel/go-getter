// What an autonomous run does next (decision 0130 items 6-8): the next step of its range, or the reason to stop and hand over.
// A stop is never skipped: the first step of the range that is not done decides, so a human-needed step blocks what follows it.
// Decision 0156: beyond that first step, `steps` also lists later pending steps for the free agent slots, never two whose
// `Do` text names the same file and never one whose `Needs` are not done.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readPlan, unapprovedReason, filesOf, openNeeds, unitStates } from '../plan.mjs';
import { readLog } from '../telemetry/record.mjs';
import { activeRun, noteStop } from './record.mjs';
import { recordRunSpend } from '../spend/index.mjs';
import { listWorktrees, worktreeConfig } from '../worktree.mjs';

export const MAX_ATTEMPTS = 2;
export const MAX_DENIALS = 2;

// Dollars spent since the run started, from the telemetry metadata log (records carry `cost`).
export function spentUsd(project, run) {
  const since = Date.parse(run.startedAt);
  return readLog(project).reduce((sum, r) => (Date.parse(r.ts) >= since && typeof r.cost === 'number' ? sum + r.cost : sum), 0);
}

export { filesOf };

// A brief a fresh session can work from with no other prompt: the plan's goal, the step's why, files, do, done-when and check.
export function stepBrief(file, step, text = readFileSync(file, 'utf8')) {
  const goal = /^\*\*Goal\*\*:\s*(.+)$/m.exec(text)?.[1];
  const f = step.fields;
  const files = [...new Set([...(f.Files ?? '').split(/\s*,\s*/).filter(Boolean), ...filesOf(f.Do)])];
  return [
    `Step ${step.id} of ${path.basename(file)}: ${step.title}`,
    ...(goal ? [`Goal of the plan: ${goal}`] : []),
    `Why: ${f.Why ?? f.Context ?? goal ?? 'see the plan'}`,
    `Files: ${files.length ? files.join(', ') : 'not named; find them from the Do text'}`,
    ...(f.Do ? [`Do: ${f.Do}`] : []),
    `Done-when: ${step.doneWhen ?? 'the Check passes'}`,
    ...(step.check ? [`Check: ${step.check}`] : []),
    'Work in your own worktree; mark the step with `go-getter plan start` and `go-getter plan done`.',
  ].join('\n');
}

// Agent slots free for this run: the concurrency limit less the linked worktrees other than this one (at least 1).
function freeSlots(project) {
  try {
    const trees = listWorktrees(project);
    const busy = trees.filter((t) => !t.main && path.resolve(t.path) !== path.resolve(project)).length;
    return Math.max(1, worktreeConfig(trees[0].path).max - busy);
  } catch {
    return 1;
  }
}

// { step } for the next step to do, { done: true } when the range is finished, { stop: { code, step?, reason } } otherwise.
export function nextInRun(project, { env = process.env, record = true, spendExec } = {}) {
  const run = activeRun(project, { env });
  if (!run) return { stop: { code: 'no-run', reason: 'no run is active' } };
  const stop = (code, reason, step) => {
    const s = { code, ...(step ? { step } : {}), reason };
    if (record) noteStop(project, s, { env });
    return { stop: s };
  };
  if (run.spendCapUsd) recordRunSpend(project, run, undefined, spendExec);
  const spent = spentUsd(project, run);
  if (run.spendCapUsd && spent >= run.spendCapUsd) return stop('spend-cap', `spend $${spent.toFixed(2)} has reached the cap of $${run.spendCapUsd}`);
  const plan = readPlan(path.join(project, run.plan));
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const external = unitStates(project);
  const planText = readFileSync(path.join(project, run.plan), 'utf8');
  const unapproved = unapprovedReason(path.join(project, run.plan));
  for (const id of run.steps) {
    const step = byId.get(id);
    if (!step || ['done', 'moved'].includes(step.state)) continue;
    if (unapproved) return stop('plan-unapproved', unapproved, id);
    if (step.human) return stop('human-needed', `step ${id} needs a person: ${step.human}`, id);
    if (step.state === 'blocked') return stop('human-needed', `step ${id} is blocked`, id);
    const attempts = run.counters?.attempts?.[id] ?? 0;
    if (attempts >= MAX_ATTEMPTS) return stop('red-attempts', `step ${id} failed ${attempts} fix attempts`, id);
    const repeated = Object.entries(run.counters?.denials?.[id] ?? {}).find(([, n]) => n >= MAX_DENIALS);
    if (repeated) return stop('repeated-denial', `step ${id} was denied ${repeated[1]} times by ${repeated[0]}`, id);
    const open = openNeeds(plan, step, external);
    if (open.length) return stop('needs-open', `step ${id} needs ${open.join(', ')}, which is not done`, id);
    const brief = (st, n) => ({ id: st.id, title: st.title, state: st.state, check: st.check ?? null, doneWhen: st.doneWhen ?? null, brief: stepBrief(path.join(project, run.plan), st, planText), ...(st.fields.Issue ? { issue: st.fields.Issue } : {}), attempts: n });
    const first = brief(step, attempts);
    const steps = [first];
    const taken = filesOf(step.fields.Do);
    const limit = freeSlots(project);
    for (const later of run.steps.slice(run.steps.indexOf(id) + 1)) {
      if (steps.length >= limit) break;
      const cand = byId.get(later);
      if (!cand || cand.state !== 'pending' || cand.human) continue;
      if (openNeeds(plan, cand, external).length) continue;
      const n = run.counters?.attempts?.[later] ?? 0;
      if (n >= MAX_ATTEMPTS || Object.values(run.counters?.denials?.[later] ?? {}).some((d) => d >= MAX_DENIALS)) continue;
      const files = filesOf(cand.fields.Do);
      if ([...files].some((f) => taken.has(f))) continue;
      files.forEach((f) => taken.add(f));
      steps.push(brief(cand, n));
    }
    return { step: first, steps };
  }
  return { done: true };
}
