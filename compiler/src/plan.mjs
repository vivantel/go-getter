// Plan reader (decision 0069, plan A.2): parses a Markdown plan's steps deterministically and offers the next ones.
// A step is `### <id> <title> — [<marker>]` followed by field lines: one metadata line `Class: … · Needs: … · Check: …`
// and text lines such as `Do:` and `Done-when:`. Every field is optional; other lines are prose and ignored.
// `start` and `done` write only a step's marker; the file WorkSource (trackers/file-source.mjs) also sets a marker and appends steps.
// Decision 0165: a step is one level of the unit contract. A plan (`## ` phase) and a feature (the part of a file before its first
// phase) may carry a header block of `Key: value` lines directly under the heading; a unit's id is `<file-stem>#<local-id>`.
import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { CLASSES } from './verify.mjs';
import { TIERS, EFFORTS } from './routing/policy.mjs';
import { DATA_CLASSES } from './routing/eligibility.mjs';
import { newWorktree, cleanWorktrees, WORKTREE_LIMIT } from './worktree.mjs';
import { parseRef, refId } from './trackers/refs.mjs';
import { recordQuietly } from './telemetry/record.mjs';
import { checkpointBeforeStep } from './checkpoint-trigger.mjs';
import { cleanGitEnv } from './git-env.mjs';
import { approvalStatus, approvalRefusal } from './plan-approval.mjs';

export const MARKERS = { ' ': 'pending', '~': 'in progress', x: 'done', '!': 'blocked', '>': 'moved' };
export const STATE_MARKER = Object.fromEntries(Object.entries(MARKERS).map(([marker, state]) => [state, marker]));
export const PLAN_DIR = path.join('docs', 'plans');
export const OWNERS = ['human', 'agent', 'either'];
const META = {
  Class: CLASSES, Effort: EFFORTS, Tier: TIERS, Data: DATA_CLASSES, Needs: null, Check: null, Issue: null, Human: null,
  Scope: null, Owner: OWNERS, 'Owner-id': null, Accept: null, Parent: null, Priority: null, Flag: null, Budget: null,
};
// A header block takes the step fields plus the unit's own id.
const HEADER_KEYS = new Set([...Object.keys(META), 'Id']);
// `<file-stem>#<local-id>`, or a bare local id.
const REF = /^(?:([0-9A-Za-z][0-9A-Za-z_.-]*)#)?([^#\s]+)$/;
// Dotted alphanumeric (`7.1`, `L.7`), with a hyphen allowed between groups for a tracker key (`PROJ-123`).
export const ID = /^[0-9A-Za-z]+([.-][0-9A-Za-z]+)*$/;
const HEADING = /^###\s+(\S+)\s+(.+?)\s+—\s+\[(.)\]\s*(.*)$/;
const PARALLEL = '‖';
// A drafted plan (`go-getter plan draft`) carries `**Approval**: pending` until a person approves it (decision 0155 item 1).
export const APPROVAL = /^\*\*Approval\*\*:[ \t]*(.*)$/m;

const MAX_OPTIONS = 4;

const stripTicks = (s) => s.replace(/^`(.*)`$/, '$1');

// File paths a step's `Do` text names: a path with a directory, or a bare name with a known extension.
const FILE = /(?:[\w.@-]+\/)+[\w@-][\w.@-]*\.[A-Za-z][\w]*|\b[\w@-]+\.(?:mjs|cjs|js|ts|json|md|ya?ml|toml|sh|txt)\b/g;
export const filesOf = (text) => new Set((String(text ?? '').match(FILE) ?? []).map((f) => f.replace(/^\.\//, '')));

export const stemOf = (file) => path.basename(String(file)).replace(/\.md$/, '');
// { stem, id } of a reference; `stem` is null for a bare local id; null for a malformed reference.
export function splitRef(ref) {
  const m = REF.exec(ref);
  return m ? { stem: m[1] ?? null, id: m[2] } : null;
}
const csv = (value) => value.split(/\s*,\s*/).filter(Boolean);

// Applies one `Key: value` to a unit (a step, a plan or a feature): `target.fields` keeps the text, the typed field is set beside it.
function applyField(target, label, key, value, at, problems) {
  if (key in target.fields) problems.push(`${at}: ${label} repeats ${key}`);
  target.fields[key] = value;
  if (META[key] && !META[key].includes(value)) problems.push(`${at}: ${label} has unknown ${key} "${value}" (${META[key].join(', ')})`);
  if (key === 'Id') {
    if (!ID.test(value)) problems.push(`${at}: ${label} has an Id "${value}" that is not a dotted alphanumeric id`);
    else target.id = value;
  } else if (key === 'Class') target.class = value;
  else if (key === 'Effort') target.effort = value;
  else if (key === 'Tier') target.tier = value;
  else if (key === 'Data') target.data = value;
  else if (key === 'Check') target.check = stripTicks(value);
  else if (key === 'Human') target.human = value;
  else if (key === 'Issue') {
    const ref = parseRef(value);
    if (!ref) problems.push(`${at}: ${label} has a malformed Issue "${value}" (#123, owner/repo#123, PROJ-123 or an issue URL)`);
    else target.issueRef = ref;
  } else if (key === 'Needs') target.needs = value === 'none' ? [] : csv(value);
  else if (key === 'Scope') target.scope = value === 'none' ? [] : csv(value.replace(/`/g, ''));
  else if (key === 'Owner') target.owner = value;
  else if (key === 'Owner-id') target.ownerId = value;
  else if (key === 'Accept') target.accept = stripTicks(value);
  else if (key === 'Parent') {
    if (!splitRef(value)) problems.push(`${at}: ${label} has a malformed Parent "${value}" (<file-stem>#<id> or a local id)`);
    else target.parent = value;
  } else if (key === 'Priority') {
    if (!/^-?\d+$/.test(value)) problems.push(`${at}: ${label} has a Priority "${value}" that is not an integer`);
    else target.priority = Number(value);
  } else if (key === 'Flag') target.flag = value;
  else if (key === 'Budget') target.budget = value;
}

// Reads the `Key: value` segments of one line (a metadata line joins several with ` · `) into a unit.
function applyLine(target, label, line, at, problems, keys) {
  for (const segment of line.split(/\s+·\s+/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(segment.trim());
    if (!kv || !keys.has(kv[1])) {
      problems.push(`${at}: ${label} has unknown field "${segment.trim()}"`);
      continue;
    }
    applyField(target, label, kv[1], kv[2], at, problems);
  }
}

const STEP_KEYS = new Set(Object.keys(META));
const newUnit = (extra) => ({ needs: [], fields: {}, ...extra });

export function parsePlan(text, file = 'plan') {
  const stem = stemOf(file);
  const steps = [];
  const plans = [];
  const problems = [];
  let feature = null; // set by the first `# ` heading
  let plan = null; // the current `## ` phase
  let step = null;
  let header = null; // the unit whose heading was just read, while `Key: value` lines follow it directly
  text.split('\n').forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    if (header) {
      const meta = /^([\w-]+):\s/.exec(line);
      if (meta && HEADER_KEYS.has(meta[1])) {
        header.headed = true;
        applyLine(header, `${header.kind} ${header.id ?? header.title}`, line, at, problems, HEADER_KEYS);
        return;
      }
      header = null;
    }
    if (/^#{1,2}\s/.test(line) || /^---\s*$/.test(line)) {
      step = null;
      if (/^##\s/.test(line)) {
        plan = newUnit({ kind: 'plan', title: line.replace(/^##\s+/, '').trim(), line: i + 1, headed: false, steps: [] });
        plans.push(plan);
        header = plan;
      } else if (/^#\s/.test(line) && !feature) {
        feature = newUnit({ kind: 'feature', id: stem, title: line.replace(/^#\s+/, '').trim(), line: i + 1, headed: false });
        header = feature;
        plan = null;
      }
      return;
    }
    if (line.startsWith('### ')) {
      const m = HEADING.exec(line);
      if (!m) {
        problems.push(`${at}: heading is not a step (\`### <id> <title> — [<marker>]\`)`);
        step = null;
        return;
      }
      const [, id, rawTitle, marker, rest] = m;
      if (!ID.test(id)) problems.push(`${at}: step id "${id}" is not a dotted alphanumeric id (a hyphen is allowed between groups)`);
      if (!(marker in MARKERS)) problems.push(`${at}: step ${id} has unknown marker [${marker}]`);
      const parallel = rawTitle.endsWith(PARALLEL) || rest.includes(PARALLEL);
      const title = rawTitle.endsWith(PARALLEL) ? rawTitle.slice(0, -1).trimEnd() : rawTitle;
      step = { id, unit: `${stem}#${id}`, title, marker, state: MARKERS[marker], parallel, line: i + 1, class: 'implement', needs: [], fields: {}, owner: 'either', priority: 0, claimable: true, planUnit: plan?.id ? `${stem}#${plan.id}` : null, planRef: plan };
      steps.push(step);
      plan?.steps.push(step);
      return;
    }
    if (!step) return;
    const meta = /^([\w-]+):\s/.exec(line);
    if (meta && meta[1] in META) {
      applyLine(step, `step ${step.id}`, line, at, problems, STEP_KEYS);
      return;
    }
    const field = /^([A-Z][A-Za-z]*(?:-[a-z]+)*):\s+(.*)$/.exec(line);
    if (field) {
      step.fields[field[1]] = field[2];
      if (field[1] === 'Done-when') step.doneWhen = field[2];
    }
  });
  for (const p of plans) {
    p.unit = p.id ? `${stem}#${p.id}` : null;
    p.claimable = Boolean(p.id);
    p.owner ??= 'either';
    p.priority ??= 0;
  }
  if (feature) {
    feature.unit = stem;
    feature.claimable = feature.headed;
    feature.owner ??= 'either';
    feature.priority ??= 0;
  }
  inherit(feature, plans, steps);
  const parsed = { file, stem, feature, plans, steps, problems };
  parsed.problems = [...problems, ...graphProblems(parsed)];
  return parsed;
}

// A unit with no `Owner-id` takes its parent's (decision 0165 item 1): the step's plan, then the file's feature.
function inherit(feature, plans, steps) {
  for (const p of plans) p.ownerId ??= feature?.ownerId;
  for (const s of steps) {
    const plan = s.planRef;
    s.ownerId ??= plan?.ownerId ?? feature?.ownerId;
    s.parent ??= plan?.unit ?? (feature?.headed ? feature.unit : undefined);
    delete s.planRef;
  }
  for (const p of plans) p.parent ??= feature?.headed ? feature.unit : undefined;
  for (const u of [...steps, ...plans, ...(feature ? [feature] : [])]) {
    for (const k of ['ownerId', 'parent']) if (u[k] === undefined) delete u[k];
  }
}

// A reference to a unit of this file or of another, as its full id (`<stem>#<id>`, or the file stem for a feature).
export function unitRef(ref, stem) {
  const r = splitRef(ref);
  if (!r) return null;
  return `${r.stem ?? stem}#${r.id}`;
}

// The paths a unit may change: its declared `Scope`, else the paths its `Do` text names (the rule of an undeclared scope, 0165).
export function effectiveScope(step) {
  return step.scope ?? [...filesOf(step.fields?.Do)];
}

// The units of one parsed plan: full id -> { kind, state, file, line }. A plan or feature is done when all its steps are done or moved.
export function planUnits(parsed) {
  const units = new Map();
  const settled = (list) => list.length > 0 && list.every((s) => s.state === 'done' || s.state === 'moved');
  for (const s of parsed.steps) units.set(s.unit, { kind: 'step', state: s.state, file: parsed.file, line: s.line });
  for (const p of parsed.plans) if (p.unit) units.set(p.unit, { kind: 'plan', state: settled(p.steps) ? 'done' : 'pending', file: parsed.file, line: p.line });
  if (parsed.feature) units.set(parsed.feature.unit, { kind: 'feature', state: settled(parsed.steps) ? 'done' : 'pending', file: parsed.file, line: parsed.feature.line });
  return units;
}

// The declared references of a unit, each with what names it: its `Needs` and its `Parent`.
function refsOf(parsed) {
  const out = [];
  const add = (unit, label, kind, list) => list.forEach((ref) => out.push({ from: unit.unit ?? `${parsed.stem}#?`, label, kind, ref, line: unit.line }));
  for (const s of parsed.steps) {
    add(s, `step ${s.id}`, 'needs', s.needs);
    if (s.fields.Parent) add(s, `step ${s.id}`, 'parent', [s.fields.Parent]);
  }
  for (const p of [...parsed.plans, ...(parsed.feature ? [parsed.feature] : [])]) {
    const label = `${p.kind} ${p.id}`;
    add(p, label, 'needs', p.needs);
    if (p.fields.Parent) add(p, label, 'parent', [p.fields.Parent]);
  }
  return out;
}

// Duplicate ids, duplicate issues, unknown Needs ids and dependency cycles inside one file; a reference to another file is
// checked by `crossPlanProblems`, which sees every plan.
function graphProblems(parsed) {
  const { steps, file, stem } = parsed;
  const problems = [];
  const byId = new Map();
  for (const s of steps) {
    if (byId.has(s.id)) problems.push(`${file}:${s.line}: step id ${s.id} is used twice`);
    else byId.set(s.id, s);
  }
  const ids = new Map([...byId].map(([id, s]) => [id, s.line]));
  for (const p of parsed.plans) {
    if (!p.id) continue;
    if (ids.has(p.id)) problems.push(`${file}:${p.line}: plan id ${p.id} is already used by a ${byId.has(p.id) ? 'step' : 'plan'} of this file`);
    else ids.set(p.id, p.line);
  }
  const issues = new Map();
  for (const s of steps) {
    if (!s.issueRef) continue;
    const id = refId(s.issueRef);
    if (issues.has(id)) problems.push(`${file}:${s.line}: step ${s.id} names issue ${s.issueRef.text}, already the issue of step ${issues.get(id)}`);
    else issues.set(id, s.id);
  }
  const local = (ref) => {
    const r = splitRef(ref);
    return r && (!r.stem || r.stem === stem) ? r.id : null;
  };
  for (const { label, kind, ref, line } of refsOf(parsed)) {
    const r = splitRef(ref);
    if (!r) problems.push(`${file}:${line}: ${label} has a malformed reference "${ref}"`);
    else if (!r.stem && !ids.has(r.id)) problems.push(`${file}:${line}: ${label} ${kind === 'parent' ? 'has unknown parent' : 'needs unknown step'} ${ref}`);
    else if (r.stem === stem && !ids.has(r.id) && !(kind === 'parent' && r.id === stem)) problems.push(`${file}:${line}: ${label} ${kind === 'parent' ? 'has unknown parent' : 'needs unknown step'} ${ref}`);
  }
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (s, trail) => {
    if (state.get(s.id) === 'done') return;
    if (state.get(s.id) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(s.id)), s.id];
      problems.push(`${file}:${s.line}: dependency cycle ${cycle.join(' -> ')}`);
      return;
    }
    state.set(s.id, 'visiting');
    for (const n of s.needs) {
      const id = local(n);
      if (id && byId.has(id)) visit(byId.get(id), [...trail, s.id]);
    }
    state.set(s.id, 'done');
  };
  for (const s of byId.values()) visit(s, []);
  return problems;
}

// The units of every plan, active first: an archived plan with the stem of an active one is shadowed by it.
export function allUnits(parsedPlans) {
  const units = new Map();
  const seen = new Set();
  const ordered = [...parsedPlans].sort((a, b) => Number(a.file.includes('archive')) - Number(b.file.includes('archive')));
  for (const parsed of ordered) {
    if (seen.has(parsed.stem)) continue;
    seen.add(parsed.stem);
    for (const [id, u] of planUnits(parsed)) units.set(id, u);
  }
  return { units, stems: seen };
}

// Cross-file problems of a set of parsed plans: a reference to a unit no plan has, and a dependency cycle through two or more
// files (a cycle inside one file is `parsePlan`'s). Archived plans are checked for their own references only against the whole set.
export function crossPlanProblems(parsedPlans) {
  const problems = [];
  const { units, stems } = allUnits(parsedPlans);
  const edges = new Map(); // full step id -> full ids it needs
  for (const parsed of parsedPlans) {
    for (const { from, label, kind, ref, line } of refsOf(parsed)) {
      const r = splitRef(ref);
      if (!r || !r.stem || r.stem === parsed.stem) continue;
      if (!stems.has(r.stem)) problems.push(`${parsed.file}:${line}: ${label} ${kind === 'parent' ? 'has parent' : 'needs'} ${ref}, but no plan has the stem "${r.stem}"`);
      else if (!units.has(`${r.stem}#${r.id}`) && !(kind === 'parent' && r.id === r.stem)) problems.push(`${parsed.file}:${line}: ${label} ${kind === 'parent' ? 'has unknown parent' : 'needs unknown unit'} ${ref}`);
      else if (kind === 'needs') edges.set(from, [...(edges.get(from) ?? []), `${r.stem}#${r.id}`]);
    }
    for (const s of parsed.steps) {
      const local = s.needs.map((n) => unitRef(n, parsed.stem)).filter(Boolean);
      edges.set(s.unit, [...new Set([...(edges.get(s.unit) ?? []), ...local])]);
    }
  }
  const fileOf = (id) => id.split('#')[0];
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(id)), id];
      if (new Set(cycle.map(fileOf)).size > 1) problems.push(`dependency cycle across plans ${cycle.join(' -> ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const n of edges.get(id) ?? []) visit(n, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of edges.keys()) visit(id, []);
  return problems;
}

// 'none' for a plan without an Approval line, else 'pending' or 'approved' with the recorded text.
export function approvalOf(text) {
  const m = APPROVAL.exec(text);
  if (!m) return { state: 'none' };
  return /^approved\b/i.test(m[1]) ? { state: 'approved', text: m[1] } : { state: 'pending', text: m[1] };
}

// The refusal for working a step of a plan that needs a person's approval, or null. A plan needs it when it carries an Approval
// line (a drafted plan) or has a record in the store; the store entry, never the line, is what approves it (decision 0186).
export function unapprovedReason(file) {
  const text = readFileSync(file, 'utf8');
  if (approvalOf(text).state === 'none' && approvalStatus(file).state === 'none') return null;
  return approvalRefusal(file);
}

export function readPlan(file) {
  return parsePlan(readFileSync(file, 'utf8'), file);
}

// Every Markdown plan under docs/plans and docs/plans/archive.
export function planFiles(root) {
  const files = [];
  for (const dir of [PLAN_DIR, path.join(PLAN_DIR, 'archive')]) {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) if (name.endsWith('.md') && name !== 'INDEX.md') files.push(path.join(dir, name));
  }
  return files;
}

// The active plans: every plan directly under docs/plans, not the archive.
export function activePlanFiles(root) {
  return planFiles(root).filter((f) => path.dirname(f) === PLAN_DIR);
}

// The plan a command acts on: the argument, or the only active plan in docs/plans.
export function resolvePlan(root, arg) {
  if (arg) return path.resolve(root, arg);
  const active = activePlanFiles(root);
  if (active.length === 1) return path.join(root, active[0]);
  throw new Error(active.length ? `several plans in ${PLAN_DIR}; name one (${active.join(', ')})` : `no plan in ${PLAN_DIR}`);
}

export function planStatus(plan) {
  const counts = Object.fromEntries(Object.values(MARKERS).map((m) => [m, 0]));
  for (const s of plan.steps) counts[s.state]++;
  return {
    file: plan.file,
    total: plan.steps.length,
    counts,
    steps: plan.steps.map(({ id, title, state, mismatch, issueState, issue }) => ({ id, title, status: state, ...(issue ? { issue } : {}), ...(mismatch ? { mismatch } : {}), ...(issueState?.stale ? { stale: issueState.fetchedAt ?? true } : {}) })),
  };
}

// The Needs of a step that are not done. A bare id or an id of this file is looked up in the plan (its steps may carry the
// work source's state); a `<stem>#<id>` of another file in `external` (full unit id -> state, see `unitStates`).
export function openNeeds(plan, step, external = new Map()) {
  const stem = stemOf(plan.file);
  const local = new Map(plan.steps.map((s) => [s.id, s.state]));
  return step.needs.filter((n) => {
    const r = splitRef(n);
    if (r && (!r.stem || r.stem === stem) && local.has(r.id)) return local.get(r.id) !== 'done';
    return external.get(r && r.stem ? n : `${stem}#${n}`) !== 'done';
  });
}

// Full unit id -> state for every unit of the repository's plans (active plans shadow archived ones of the same stem).
export function unitStates(root) {
  const parsed = planFiles(root).map((f) => parsePlan(readFileSync(path.join(root, f), 'utf8'), f));
  return new Map([...allUnits(parsed).units].map(([id, u]) => [id, u.state]));
}

// Pending steps whose Needs are all done, in plan order, at most 4. `parallel` marks an option the plan
// declares parallel (`‖`) when another option is also declared parallel. `external` holds the states of other plans' units.
export function nextSteps(plan, max = MAX_OPTIONS, external = new Map()) {
  const ready = plan.steps.filter((s) => s.state === 'pending' && !openNeeds(plan, s, external).length).slice(0, max);
  const parallelCount = ready.filter((s) => s.parallel).length;
  return ready.map((s, i) => ({
    option: i + 1,
    id: s.id,
    title: s.title,
    class: s.class,
    parallel: s.parallel && parallelCount > 1,
    doneWhen: s.doneWhen ?? null,
    ...(s.issue ? { issue: s.issue } : {}),
    // the unit fields, only when a step sets them, so a plan without them lists as before
    ...(s.owner && s.owner !== 'either' ? { owner: s.owner } : {}),
    ...(s.priority ? { priority: s.priority } : {}),
    ...(s.scope ? { scope: s.scope } : {}),
    ...(s.accept ? { accept: s.accept } : {}),
    ...(s.flag ? { flag: s.flag } : {}),
    ...(s.budget ? { budget: s.budget } : {}),
  }));
}

export function formatStatus(status) {
  const c = status.counts;
  const lines = [`${status.file}: ${c.done}/${status.total} done, ${c['in progress']} in progress, ${c.blocked} blocked, ${c.moved} moved, ${c.pending} pending`];
  for (const s of status.steps) {
    const note = [s.claim ? `claimed by ${s.claim.kind} ${s.claim.holder}${s.claim.parked ? ', parked' : ''}${s.claim.idle ? ', idle' : ''}` : null, s.mismatch ? `mismatch: ${s.mismatch}` : null, s.stale ? `issue state ${s.stale === true ? 'unknown' : `as of ${s.stale}`}, stale` : null].filter(Boolean).join('; ');
    if (s.status !== 'done' || s.mismatch) lines.push(`[${STATE_MARKER[s.status]}] ${s.id} ${s.title}${s.issue ? ` ${s.issue}` : ''}${note ? ` (${note})` : ''}`);
  }
  return lines.join('\n');
}

export function formatNext(options) {
  if (!options.length) return 'no step is ready: every pending step needs one that is not done';
  return options
    .map((o) => `${o.option}. ${o.id} ${o.title}${o.issue ? ` ${o.issue}` : ''} (${o.class})${o.parallel ? ` ${PARALLEL}` : ''}${o.doneWhen ? `\n   Done-when: ${o.doneWhen}` : ''}`)
    .join('\n');
}

// The plan's text with `Issue: <reference>` as the first line of a step's block (the heading's next line).
export function setIssueField(text, step, reference) {
  const lines = text.split('\n');
  lines.splice(step.line, 0, `Issue: ${reference}`);
  return lines.join('\n');
}

// What a step says, as the body of its issue: its prose lines (`Do:`, `Done-when:`, notes), without the metadata line, a
// bare `Issue:` or `Check:` (a command stays in the plan, 0119).
export function stepBody(text, step) {
  const lines = text.split('\n');
  const out = [];
  for (let i = step.line; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,3}\s/.test(line) || /^---\s*$/.test(line)) break;
    if (/^(Class|Effort|Tier|Data|Needs|Check|Issue|Scope|Owner|Owner-id|Accept|Parent|Priority|Flag|Budget):\s/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

// What `plan start` prints so the step can be worked at once: the step's heading, prose and Check, and where to work.
export function formatBrief(file, id, dir) {
  const { step } = findStep(file, id);
  const body = stepBody(readFileSync(file, 'utf8'), step);
  return [`${step.id} ${step.title}`, body, step.check ? `Check: ${step.check}` : '', `Work in: ${dir}`].filter(Boolean).join('\n');
}

// --- start and done ----------------------------------------------------------------------------------------------

const CHECK_TIMEOUT_MS = 30 * 60 * 1000;
const TAIL_LINES = 20;

// Rewrites only the marker of one step's heading line.
export function setMarker(text, step, marker) {
  const lines = text.split('\n');
  lines[step.line - 1] = lines[step.line - 1].replace(/(\s—\s+)\[.\]/, `$1[${marker}]`);
  return lines.join('\n');
}

export function repoRoot(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, env: cleanGitEnv(process.env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return dir;
  }
}

function findStep(file, id) {
  const plan = parsePlan(readFileSync(file, 'utf8'), file);
  if (plan.problems.length) throw new Error(`the plan does not parse: ${plan.problems[0]}`);
  const step = plan.steps.find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id} in ${file}`);
  return { plan, step };
}

// Sets a step's marker without running its Check: for `work accept`, whose own check is the step's `Accept`.
export const setStepMarker = (file, id, marker) => writeMarker(file, id, marker);
const writeMarker = (file, id, marker) => writeFileSync(file, setMarker(readFileSync(file, 'utf8'), findStep(file, id).step, marker));

// Sets a pending or blocked step to `[~]` once its Needs are done. With `worktree` (a slug) it first creates the task's
// worktree (`go-getter worktree new`) and sets the marker in that worktree's copy of the plan, so it lands with the step's branch.
export function startStep(cwd, file, id, { worktree, states } = {}) {
  const { plan, step } = findStep(file, id);
  const blocked = unapprovedReason(file);
  if (blocked) throw new Error(blocked);
  if (step.marker === 'x' || step.marker === '>' || step.marker === '!') throw new Error(`step ${id} is ${MARKERS[step.marker]}${step.marker === '!' ? ' (unblock it first)' : ''}`);
  if (step.marker === '~' && !worktree) return { changed: false, file };
  // `states` (step id -> state) comes from the work source, so a step whose issue is still open is not done.
  const viewed = states ? { file, steps: plan.steps.map((s) => ({ ...s, state: states.get(s.id) ?? s.state })) } : plan;
  const open = openNeeds(viewed, step, step.needs.some((n) => n.includes('#')) ? unitStates(repoRoot(path.dirname(file))) : undefined);
  if (open.length) throw new Error(`step ${id} needs ${open.join(', ')}, not done yet`);
  let target = file;
  let made;
  if (worktree) {
    try {
      made = newWorktree(cwd, worktree);
    } catch (err) {
      if (err.code !== WORKTREE_LIMIT) throw err;
      // At the limit: release merged worktrees once (the safe criteria of `worktree clean`), then retry once.
      try {
        cleanWorktrees(cwd, { keepBranch: true });
      } catch { /* a failed clean must not replace the limit refusal; the retry reports it */ }
      made = newWorktree(cwd, worktree);
    }
    const copy = path.join(made.path, path.relative(repoRoot(path.dirname(file)), file));
    if (existsSync(copy)) target = copy;
  }
  checkpointBeforeStep(repoRoot(cwd), id);
  writeMarker(target, id, '~');
  return { changed: true, file: target, worktree: made };
}

// Runs the step's Check from the repository root and sets `[x]` only when it passes; records one telemetry line
// (event `plan:done`, the step's class, pass or fail), never the check's output.
export function doneStep(cwd, file, id) {
  const { step } = findStep(file, id);
  if (step.marker === 'x') return { ok: true, changed: false, output: '' };
  if (step.marker === '>') throw new Error(`step ${id} is moved to another plan`);
  if (!step.check) throw new Error(`step ${id} has no Check; add one or set the marker by hand`);
  const root = repoRoot(cwd);
  const res = spawnSync(step.check, { cwd: root, shell: true, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });
  const ok = res.status === 0;
  recordQuietly(root, { event: 'plan:done', taskClass: step.class, outcome: ok ? 'pass' : 'fail' });
  if (ok) writeMarker(file, id, 'x');
  const output = ok ? '' : `${res.stdout ?? ''}\n${res.stderr ?? ''}${res.error ? `\n${res.error.message}` : ''}`.trim().split('\n').slice(-TAIL_LINES).join('\n');
  return { ok, changed: ok, check: step.check, output };
}
