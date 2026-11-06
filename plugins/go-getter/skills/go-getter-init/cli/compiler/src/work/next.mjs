// Which units a worker may take next (decision 0167 item 1): pending, `Needs` done, not claimed, scope clear of every live claim
// and of the units already chosen, an `Owner` that fits the caller, approved (intake), and under the WIP limits. One overlap rule (`scope.mjs`) serves `work next` and `run next`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openNeeds, parsePlan, stemOf, activePlanFiles, unitRef, unitStates, effectiveScope } from '../plan.mjs';
import { conflict } from './claim.mjs';
import { clockNow, ledgerView } from './ops.mjs';
import { overlap } from './scope.mjs';
import { loadCapabilityTags, unknownTags, unmetTags } from '../capability-tags.mjs';
import { intakeState } from './intake.mjs';
import { byPriority, chainLengths, effectivePriority, flowSettings, pickAmong } from './priority.mjs';

// Owners a caller of this kind may take: a person takes `human` and `either`, an agent or CI job takes `agent` and `either`.
export const ownerFits = (owner, kind) => !owner || owner === 'either' || owner === (kind === 'human' ? 'human' : 'agent');

// The first of `taken` (a list of { unit, scope }) whose scope overlaps `scope`: { unit, tokens } or null.
export function overlapsAny(scope, taken) {
  for (const t of taken) {
    const hit = overlap(t.scope, scope);
    if (hit) return { unit: t.unit, tokens: hit };
  }
  return null;
}

// { ready: [{ unit, id, title, file, scope }], queued: [{ unit, behind, holder?, tokens? }], skipped: [{ unit, reason }] }.
// Candidates are ordered by priority (inherited from the parent), the longest chain of units waiting on them, then plan order (age);
// a ready unit overlaps no live claim and no earlier ready unit; an overlapping one is queued behind the claim or unit that holds the
// scope. With a `worker`, nothing is offered above its WIP limit or a feature's, and its hash picks among the first `pickAmong` ready
// units (decision 0174 items 1 and 2). With `has` (a list of tags), a unit is offered only when the worker holds every tag in its
// `Needs-capability` (decision 0181); without it, tagged units are offered to everyone (the claim check cannot prove a capability). `remote` null reads the last ledger seen; a remote name fetches from it first.
export function nextUnits(root, { ownerKind = 'agent', worker = null, now = clockNow(), remote = null, limit = Infinity, has = null, flow = flowSettings(root) } = {}) {
  const external = unitStates(root);
  const vocab = loadCapabilityTags(root);
  const out = { ready: [], queued: [], skipped: [] };
  const chosen = [];
  const plans = activePlanFiles(root).map((file) => {
    const parsed = parsePlan(readFileSync(path.join(root, file), 'utf8'), file);
    return { file, parsed, stem: stemOf(file), view: ledgerView(root, stemOf(file), { now, remote }) };
  });
  const units = new Map();
  for (const { parsed } of plans) for (const u of [...parsed.steps, ...parsed.plans, ...(parsed.feature ? [parsed.feature] : [])]) if (u.unit) units.set(u.unit, { ...u, stem: parsed.stem });
  const parentOf = (u) => {
    if (!u.parent) return undefined;
    const ref = unitRef(u.parent, u.stem);
    return units.get(ref) ?? units.get(ref.split('#')[0]); // a feature's id is its file stem
  };
  const needs = new Map();
  for (const { parsed } of plans) for (const s of parsed.steps) needs.set(s.unit, s.needs.map((n) => unitRef(n, parsed.stem)).filter(Boolean));
  const chains = chainLengths(needs, new Set([...units.keys()].filter((id) => units.get(id).state === 'pending' || !units.get(id).state)));
  // live claims that occupy a worker: a leaf claim that is not parked (a parked unit never holds a worker, 0168)
  const live = plans.flatMap(({ stem, view }) => [...view.annotated.states.values()].filter((a) => a.live && !a.parked && !a.children).map((a) => ({ stem, holder: a.entry.holder.id })));
  const heldBy = worker ? live.filter((l) => l.holder === worker.id).length : 0;
  const workerFull = worker && heldBy >= flow.wipPerWorker;
  const candidates = [];
  let age = 0;
  for (const { file, parsed, stem, view } of plans) {
    const featureFull = flow.wipPerFeature !== null && live.filter((l) => l.stem === stem).length >= flow.wipPerFeature;
    for (const step of parsed.steps) {
      age++;
      if (step.state !== 'pending') continue;
      const skip = (reason) => out.skipped.push({ unit: step.unit, reason });
      const intake = step.claimable ? intakeState(root, { step, stem, parsed, unit: step.unit }, { now, remote, tip: view.tip }) : { ready: true };
      if (!step.claimable) skip('no header with an Id');
      else if (step.human) skip(`needs a person: ${step.human}`);
      else if (!ownerFits(step.owner, ownerKind)) skip(`owner is ${step.owner}`);
      else if (unknownTags(step.needsCapability, vocab).length) skip(`unknown capability ${unknownTags(step.needsCapability, vocab).join(', ')}`);
      else if (has && unmetTags(step.needsCapability, has).length) skip(`needs capability ${unmetTags(step.needsCapability, has).join(', ')}`);
      else if (openNeeds(parsed, step, external).length) skip(`needs ${openNeeds(parsed, step, external).join(', ')}`);
      else if (view.annotated.states.get(step.unit)?.live) skip('claimed');
      else if (view.annotated.states.get(step.unit)?.entry.blockedByHuman) skip('blocked-by-human');
      else if (view.annotated.states.get(step.unit)?.entry.exit) skip(view.annotated.states.get(step.unit).entry.exit);
      else if (view.annotated.states.get(step.unit)?.entry.counters?.claimants >= 3 && !view.annotated.states.get(step.unit).entry.answer) skip('quarantined: three claimants'); // decision 0173 item 3
      else if (!intake.ready) skip(intake.reason);
      else if (workerFull) skip(`worker limit: ${worker.id} holds ${heldBy} of ${flow.wipPerWorker}`);
      else if (featureFull) skip(`feature limit: ${stem} has ${flow.wipPerFeature} live claims`);
      else candidates.push({ step, file, stem, view, priority: effectivePriority(units.get(step.unit) ?? step, parentOf), chain: chains.get(step.unit) ?? 0, age });
    }
  }
  candidates.sort(byPriority);
  for (const { step, file, stem, view } of candidates) {
    const scope = effectiveScope(step);
    const parent = step.parent ? unitRef(step.parent, stem) : null;
    const clash = conflict(view.annotated, { unit: step.unit, scope, parent });
    const early = clash ? null : overlapsAny(scope, chosen);
    if (clash) out.queued.push({ unit: step.unit, behind: clash.entry.unit, holder: clash.entry.holder, ...(clash.tokens ? { tokens: clash.tokens } : {}) });
    else if (early) out.queued.push({ unit: step.unit, behind: early.unit, tokens: early.tokens });
    else if (out.ready.length < limit) {
      chosen.push({ unit: step.unit, scope });
      out.ready.push({ unit: step.unit, id: step.id, title: step.title, file, scope });
    }
  }
  if (worker) out.ready = pickAmong(out.ready, worker.id, flow.pickAmong);
  return out;
}
