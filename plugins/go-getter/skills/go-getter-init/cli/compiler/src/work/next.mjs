// Which units a worker may take next (decision 0167 item 1): pending, `Needs` done, not claimed, scope clear of every live claim
// and of the units already chosen, and an `Owner` that fits the caller. One overlap rule (`scope.mjs`) serves `work next` and `run next`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openNeeds, parsePlan, stemOf, activePlanFiles, unitRef, unitStates, effectiveScope } from '../plan.mjs';
import { conflict } from './claim.mjs';
import { clockNow, ledgerView } from './ops.mjs';
import { overlap } from './scope.mjs';

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

// { ready: [{ unit, id, title, file, scope }], queued: [{ unit, behind, holder?, tokens? }], skipped: [{ unit, reason }] } in plan order.
// A ready unit overlaps no live claim and no earlier ready unit; an overlapping one is queued behind the claim or unit that holds the scope.
// `remote` null reads the last ledger seen; a remote name fetches from it first.
export function nextUnits(root, { ownerKind = 'agent', now = clockNow(), remote = null, limit = Infinity } = {}) {
  const external = unitStates(root);
  const out = { ready: [], queued: [], skipped: [] };
  const chosen = [];
  for (const file of activePlanFiles(root)) {
    const plan = parsePlan(readFileSync(path.join(root, file), 'utf8'), file);
    const stem = stemOf(file);
    const view = ledgerView(root, stem, { now, remote });
    for (const step of plan.steps) {
      if (step.state !== 'pending') continue;
      const skip = (reason) => out.skipped.push({ unit: step.unit, reason });
      if (!step.claimable) skip('no header with an Id');
      else if (step.human) skip(`needs a person: ${step.human}`);
      else if (!ownerFits(step.owner, ownerKind)) skip(`owner is ${step.owner}`);
      else if (openNeeds(plan, step, external).length) skip(`needs ${openNeeds(plan, step, external).join(', ')}`);
      else if (view.annotated.states.get(step.unit)?.live) skip('claimed');
      else if (view.annotated.states.get(step.unit)?.entry.blockedByHuman) skip('blocked-by-human');
      else {
        const scope = effectiveScope(step);
        const parent = step.fields.Parent ? unitRef(step.fields.Parent, stem) : null;
        const clash = conflict(view.annotated, { unit: step.unit, scope, parent });
        const early = clash ? null : overlapsAny(scope, chosen);
        if (clash) out.queued.push({ unit: step.unit, behind: clash.entry.unit, holder: clash.entry.holder, ...(clash.tokens ? { tokens: clash.tokens } : {}) });
        else if (early) out.queued.push({ unit: step.unit, behind: early.unit, tokens: early.tokens });
        else if (out.ready.length < limit) {
          chosen.push({ unit: step.unit, scope });
          out.ready.push({ unit: step.unit, id: step.id, title: step.title, file, scope });
        }
      }
    }
  }
  return out;
}
