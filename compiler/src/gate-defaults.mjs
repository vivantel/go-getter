// What `ship` runs by default (decision 0158 item 1, owner aim 0155): the Check of the step this branch works on, read from the
// plan, and a model call for the conform and reviewer gates when the project's answers allow one. Both are decided here, apart
// from the runners, so tests inject runners and never reach a model.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { activePlanFiles, parsePlan } from './plan.mjs';
import { adoptedData } from './governance.mjs';
import { loadPolicy } from './routing/policy.mjs';
import { eligibleModels } from './routing/eligibility.mjs';
import { loadRegistry } from './routing/registry.mjs';
import { activeRun } from './runs/record.mjs';
import { spentUsd } from './runs/next.mjs';

// What one gate pass may spend at most, when nothing lower binds (the claude gate's own cap).
export const GATE_BUDGET_USD = 2;
// The runner `ship` reaches the model through, as a provider/model pair for the governance check.
const GATE_MODEL = { id: 'claude', provider: 'anthropic', local: false };

const inProgress = (text, file) => parsePlan(text, file).steps.filter((s) => s.state === 'in progress');

// The step this branch works on: a step marked `[~]` in this worktree's plan that is not already `[~]` on origin/<base>
// (`go-getter plan start --worktree` sets the marker in the worktree's copy). { id, plan, check } or { reason }.
export function stepForBranch(project, base, run) {
  const found = [];
  for (const rel of activePlanFiles(project)) {
    const file = path.join(project, rel);
    if (!existsSync(file)) continue;
    const mine = inProgress(readFileSync(file, 'utf8'), rel);
    if (!mine.length) continue;
    const onBase = run('git', ['show', `origin/${base}:${rel.split(path.sep).join('/')}`], { cwd: project });
    const already = new Set(onBase.code === 0 ? inProgress(onBase.out, rel).map((s) => s.id) : []);
    for (const s of mine) if (!already.has(s.id)) found.push({ id: s.id, plan: rel, check: s.check ?? null });
  }
  if (!found.length) return { reason: 'no step' };
  if (found.length > 1) return { reason: `no step (${found.map((s) => s.id).join(', ')} are all in progress here)` };
  const [step] = found;
  return step.check ? step : { reason: `step ${step.id} has no Check` };
}

// { ok: true, budgetUsd } when a model call is allowed for the conform and reviewer gates, else { ok: false, reason }.
// Governance first (routing-governance-before-cost): with a model registry adopted, the model's provider must be eligible for
// internal data, since the diff goes to it. Then the spend cap: an active run's cap, less what it spent, bounds the budget.
export function modelGatePolicy(project) {
  if (adoptedData(project, 'model-registry') !== undefined) {
    const { registry } = loadRegistry(project);
    if (!eligibleModels({ dataClass: 'internal', models: [GATE_MODEL], registry }).length) return { ok: false, reason: 'no eligible model for internal data (routing-governance-before-cost)' };
  }
  let budgetUsd = GATE_BUDGET_USD;
  const run = activeRun(project);
  const cap = run?.spendCapUsd ?? loadPolicy(project)?.spendCapUsd ?? null;
  if (cap) {
    const remaining = run?.spendCapUsd ? cap - spentUsd(project, run) : cap;
    if (remaining <= 0) return { ok: false, reason: `spend cap of $${cap} reached` };
    budgetUsd = Math.min(budgetUsd, remaining);
  }
  return { ok: true, budgetUsd };
}
