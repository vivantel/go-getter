// Intake (decision 0174 item 3): a unit marked `Intake: draft` is not offered until it parses, declares its scope and `Accept` where
// required, and is approved: by the holder of its parent's claim within the grant that holder has, by the parent's `Owner-id` (a
// parked ask when the unit exceeds that grant or the parent has no live holder), or by the declaration of the rule that generated it
// (`Rule: <kind>` on its own line), which still has to fit the parent's grant. A unit with no `Intake: draft` line is in a merged plan
// and was approved by that merge. The approval is a record in the feature's claims ledger (`<id>.approval.json`), authored by the approver.
import { briefOf, briefVersion } from './claim.mjs';
import { APPROVAL_SUFFIX, commitEntries, fetchLedger, git, ledgerRef, noteLedger, pushRef, remoteOf } from './ledger.mjs';
import { claimSettings, clockNow, findUnit, ledgerView } from './ops.mjs';
import { effectiveScope, splitRef } from '../plan.mjs';
import { uncovered } from './scope.mjs';
import { loadCapabilityTags, unknownTags } from '../capability-tags.mjs';

// Rules whose declaration approves the units they generate (0179 readings, 0175 flake fixes, 0177 incident and recurring units, 0167 change requests).
export const RULES = ['reading', 'flake-fix', 'incident', 'recurring', 'change-request'];

export const isDraft = (step) => String(step.fields?.Intake ?? '').trim() === 'draft';
export const ruleOf = (step) => (step.fields?.Rule ? String(step.fields.Rule).trim() : null);
const approvalFile = (unit) => `${unit.includes('#') ? unit.split('#')[1] : unit}${APPROVAL_SUFFIX}`;
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const fullRef = (ref, stem) => (ref.includes('#') || ref === stem ? ref : `${stem}#${ref}`);

// Why a unit cannot be approved yet, as a list: parse problems on its lines, an undeclared scope, a missing `Accept` where required
// (a plan or feature, or a unit other units name as their parent).
export function intakeProblems(step, parsed, vocab = new Map()) {
  const out = [];
  const end = parsed.steps.find((s) => s.line > step.line)?.line ?? Infinity;
  for (const p of parsed.problems) {
    const line = Number(/:(\d+):/.exec(p)?.[1]);
    if (line >= step.line && line < end) out.push(p.replace(/^[^:]+:\d+:\s*/, ''));
  }
  if (step.scope === undefined) out.push('declares no Scope (use `Scope: none` for a unit that changes nothing)');
  const hasKids = [...parsed.steps, ...parsed.plans].some((s) => s.parent && fullRef(s.parent, parsed.stem) === step.unit);
  if ((step.kind || hasKids) && !step.accept) out.push('declares no Accept, which a plan, a feature and a unit with children need');
  for (const t of unknownTags(step.needsCapability, vocab)) out.push(`names an unknown capability "${t}" (docs/skills/capabilities.md)`);
  if (ruleOf(step) && !RULES.includes(ruleOf(step))) out.push(`names an unknown Rule "${ruleOf(step)}" (${RULES.join(', ')})`);
  return out;
}

// The scope the parent's holder may hand down: the live claim's grant scope (K8) or its scope; with no live claim, the parent's own
// declared scope. { scope, entry|null, live }.
export function parentGrant(root, stem, step, { now = clockNow(), remote = null } = {}) {
  if (!step.parent) return { scope: [], entry: null, live: false, none: true };
  const parentUnit = fullRef(step.parent, stem);
  const found = findUnit(root, parentUnit);
  const pstem = found.error ? splitRef(parentUnit)?.stem ?? stem : found.stem;
  const state = ledgerView(root, pstem, { now, remote, settings: claimSettings(root) }).annotated.states.get(parentUnit);
  const declared = found.error ? [] : effectiveScope(found.step);
  if (state?.live && state.entry.state !== 'released') return { scope: state.entry.grant?.scope ?? state.entry.scope, entry: state.entry, live: true, unit: parentUnit, ownerId: found.step?.ownerId };
  return { scope: declared, entry: null, live: false, unit: parentUnit, ownerId: found.step?.ownerId };
}

// The latest valid approval of a unit in a ledger tip: { approver, by, brief } or null. Valid: authored by the named approver and
// made for the unit's current brief.
export function readApproval(root, tip, unit, brief) {
  if (!tip) return null;
  const file = approvalFile(unit);
  const body = git(root, ['show', `${tip}:${file}`], { allowFail: true });
  if (!body) return null;
  const author = git(root, ['log', '-1', '--format=%an', tip, '--', file], { allowFail: true });
  try {
    const rec = JSON.parse(body);
    return rec.unit === unit && rec.approver?.id === author && rec.brief === briefVersion(brief) ? rec : null;
  } catch {
    return null;
  }
}

// Whether `step` (a unit of `file`) may be offered now: { ready: true, by? } or { ready: false, reason }.
export function intakeState(root, found, { now = clockNow(), remote = null, tip } = {}) {
  const { step, stem, parsed, unit } = found;
  if (!isDraft(step)) return { ready: true };
  const problems = intakeProblems(step, parsed, loadCapabilityTags(root));
  if (problems.length) return { ready: false, reason: `draft: ${problems[0]}` };
  const scope = effectiveScope(step);
  const rule = ruleOf(step);
  if (rule) {
    const g = parentGrant(root, stem, step, { now, remote });
    const out = uncovered(g.scope, scope);
    return out ? { ready: false, reason: `draft: rule ${rule} generated a unit whose scope ${out} exceeds its parent's grant` } : { ready: true, by: `rule ${rule}` };
  }
  const rec = readApproval(root, tip, unit, briefOf(step));
  return rec ? { ready: true, by: rec.by } : { ready: false, reason: 'draft: not approved yet (go-getter work approve)' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `work approve <unit>`: check the unit, decide who may approve it, record the approval. Returns { ok, by } on approval,
// { ok: false, code: 'ask', ask } when the parent's Owner-id must be asked (a parked ask, 0168), or a refusal.
export async function approveUnit(root, ref, who, { now = clockNow(), remote, hooks } = {}) {
  const found = findUnit(root, ref);
  if (found.error) return fail('unknown-unit', found.error);
  const { unit, stem, step } = found;
  if (!isDraft(step)) return fail('not-draft', `${unit} is not a draft (no \`Intake: draft\` line); a unit in a merged plan is approved by the merge`);
  const problems = intakeProblems(step, found.parsed, loadCapabilityTags(root));
  if (problems.length) return fail('refused', `${unit} cannot be approved: ${problems.join('; ')}`, { problems });
  const scope = effectiveScope(step);
  const g = parentGrant(root, stem, step, { now, remote });
  const rule = ruleOf(step);
  const out = uncovered(g.scope, scope);
  if (rule) {
    if (out) return fail('refused', `${unit}: the scope ${out} of this ${rule} unit exceeds its parent's grant, so the rule cannot approve it`);
    return { ok: true, by: `rule ${rule}`, record: false, unit };
  }
  const ownerId = step.ownerId ?? g.ownerId;
  const holder = g.entry && (g.entry.holder.id === who.id) ;
  const isOwner = who.kind === 'human' && ownerId && who.id === ownerId;
  let by;
  if (holder && !out) by = 'parent-holder';
  else if (isOwner) by = 'owner-id';
  else if (!step.parent && who.kind === 'human') by = 'root-human';
  else {
    const why = !step.parent ? 'it has no parent, so a person starts it' : !g.live ? `its parent ${g.unit} has no live holder` : out ? `its scope ${out} exceeds the grant of its parent's holder` : `${who.id} does not hold its parent ${g.unit}`;
    return fail('ask', `${unit} needs the approval of ${ownerId ?? 'its owner'}: ${why}`, { ask: { kind: 'approval', unit, to: ownerId ?? null, reason: why } });
  }
  const rem = remote === undefined ? remoteOf(root) : remote;
  const record = { unit, approver: { kind: who.kind, id: who.id }, by, parent: step.parent ? g.unit : null, brief: briefVersion(briefOf(step)), scope, approved: now.toISOString() };
  for (let attempt = 0; attempt < 8; attempt++) {
    const ledger = fetchLedger(root, stem, rem);
    if (!ledger.online) return fail('offline', 'the remote could not be reached; nothing was approved');
    if (ledger.diverged) return fail('diverged', `the ledger on the remote does not continue the last version this clone saw; ${ledger.recovery}`);
    const commit = commitEntries(root, ledger.tip, { [approvalFile(unit)]: record }, { author: who.id, message: `approve ${unit} by ${by}`, now });
    await hooks?.beforePush?.({ attempt });
    const pushed = pushRef(root, rem, ledgerRef(stem), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(25 * 2 ** attempt);
      continue;
    }
    if (rem) noteLedger(root, stem, commit);
    return { ok: true, by, record: true, unit, commit };
  }
  return fail('contended', `${unit}: the ledger kept changing; try again`);
}

