// Plan reader (decision 0069, plan A.2): parses a Markdown plan's steps deterministically and offers the next ones.
// A step is `### <id> <title> — [<marker>]` followed by field lines: one metadata line `Class: … · Needs: … · Check: …`
// and text lines such as `Do:` and `Done-when:`. Every field is optional; other lines are prose and ignored.
import path from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { CLASSES } from './verify.mjs';
import { TIERS, EFFORTS } from './routing/policy.mjs';
import { DATA_CLASSES } from './routing/eligibility.mjs';

export const MARKERS = { ' ': 'pending', '~': 'in progress', x: 'done', '!': 'blocked', '>': 'moved' };
export const PLAN_DIR = path.join('docs', 'plans');
const META = { Class: CLASSES, Effort: EFFORTS, Tier: TIERS, Data: DATA_CLASSES, Needs: null, Check: null };
const ID = /^[0-9A-Za-z]+(\.[0-9A-Za-z]+)*$/;
const HEADING = /^###\s+(\S+)\s+(.+?)\s+—\s+\[(.)\]\s*(.*)$/;
const PARALLEL = '‖';
const MAX_OPTIONS = 4;

const stripTicks = (s) => s.replace(/^`(.*)`$/, '$1');

export function parsePlan(text, file = 'plan') {
  const steps = [];
  const problems = [];
  let step = null;
  text.split('\n').forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    if (/^#{1,2}\s/.test(line) || /^---\s*$/.test(line)) {
      step = null;
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
      if (!ID.test(id)) problems.push(`${at}: step id "${id}" is not a dotted alphanumeric id`);
      if (!(marker in MARKERS)) problems.push(`${at}: step ${id} has unknown marker [${marker}]`);
      const parallel = rawTitle.endsWith(PARALLEL) || rest.includes(PARALLEL);
      const title = rawTitle.endsWith(PARALLEL) ? rawTitle.slice(0, -1).trimEnd() : rawTitle;
      step = { id, title, marker, parallel, line: i + 1, class: 'implement', needs: [], fields: {} };
      steps.push(step);
      return;
    }
    if (!step) return;
    const meta = /^(\w+):\s/.exec(line);
    if (meta && meta[1] in META) {
      for (const segment of line.split(/\s+·\s+/)) {
        const kv = /^(\w+):\s*(.*)$/.exec(segment.trim());
        if (!kv || !(kv[1] in META)) {
          problems.push(`${at}: step ${step.id} has unknown field "${segment.trim()}"`);
          continue;
        }
        const [, key, value] = kv;
        if (key in step.fields) problems.push(`${at}: step ${step.id} repeats ${key}`);
        step.fields[key] = value;
        if (META[key] && !META[key].includes(value)) problems.push(`${at}: step ${step.id} has unknown ${key} "${value}" (${META[key].join(', ')})`);
        if (key === 'Class') step.class = value;
        else if (key === 'Effort') step.effort = value;
        else if (key === 'Tier') step.tier = value;
        else if (key === 'Data') step.data = value;
        else if (key === 'Check') step.check = stripTicks(value);
        else if (key === 'Needs') step.needs = value === 'none' ? [] : value.split(/\s*,\s*/).filter(Boolean);
      }
      return;
    }
    const field = /^([A-Z][A-Za-z]*(?:-[a-z]+)*):\s+(.*)$/.exec(line);
    if (field) {
      step.fields[field[1]] = field[2];
      if (field[1] === 'Done-when') step.doneWhen = field[2];
    }
  });
  return { file, steps, problems: [...problems, ...graphProblems(steps, file)] };
}

// Duplicate ids, unknown Needs ids and dependency cycles.
function graphProblems(steps, file) {
  const problems = [];
  const byId = new Map();
  for (const s of steps) {
    if (byId.has(s.id)) problems.push(`${file}:${s.line}: step id ${s.id} is used twice`);
    else byId.set(s.id, s);
  }
  for (const s of steps) for (const n of s.needs) if (!byId.has(n)) problems.push(`${file}:${s.line}: step ${s.id} needs unknown step ${n}`);
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (s, trail) => {
    if (state.get(s.id) === 'done') return;
    if (state.get(s.id) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(s.id)), s.id];
      problems.push(`${file}:${s.line}: dependency cycle ${cycle.join(' -> ')}`);
      return;
    }
    state.set(s.id, 'visiting');
    for (const n of s.needs) if (byId.has(n)) visit(byId.get(n), [...trail, s.id]);
    state.set(s.id, 'done');
  };
  for (const s of byId.values()) visit(s, []);
  return problems;
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

// The plan a command acts on: the argument, or the only active plan in docs/plans.
export function resolvePlan(root, arg) {
  if (arg) return path.resolve(root, arg);
  const active = planFiles(root).filter((f) => path.dirname(f) === PLAN_DIR);
  if (active.length === 1) return path.join(root, active[0]);
  throw new Error(active.length ? `several plans in ${PLAN_DIR}; name one (${active.join(', ')})` : `no plan in ${PLAN_DIR}`);
}

export function planStatus(plan) {
  const counts = Object.fromEntries(Object.values(MARKERS).map((m) => [m, 0]));
  for (const s of plan.steps) counts[MARKERS[s.marker]]++;
  return { file: plan.file, total: plan.steps.length, counts, steps: plan.steps.map(({ id, title, marker }) => ({ id, title, status: MARKERS[marker] })) };
}

// Pending steps whose Needs are all done, in plan order, at most 4. `parallel` marks an option the plan
// declares parallel (`‖`) when another option is also declared parallel.
export function nextSteps(plan, max = MAX_OPTIONS) {
  const done = new Set(plan.steps.filter((s) => s.marker === 'x').map((s) => s.id));
  const ready = plan.steps.filter((s) => s.marker === ' ' && s.needs.every((n) => done.has(n))).slice(0, max);
  const parallelCount = ready.filter((s) => s.parallel).length;
  return ready.map((s, i) => ({
    option: i + 1,
    id: s.id,
    title: s.title,
    class: s.class,
    parallel: s.parallel && parallelCount > 1,
    doneWhen: s.doneWhen ?? null,
  }));
}

export function formatStatus(status) {
  const c = status.counts;
  const lines = [`${status.file}: ${c.done}/${status.total} done, ${c['in progress']} in progress, ${c.blocked} blocked, ${c.moved} moved, ${c.pending} pending`];
  const mark = Object.fromEntries(Object.entries(MARKERS).map(([k, v]) => [v, k]));
  for (const s of status.steps) if (s.status !== 'done') lines.push(`[${mark[s.status]}] ${s.id} ${s.title}`);
  return lines.join('\n');
}

export function formatNext(options) {
  if (!options.length) return 'no step is ready: every pending step needs one that is not done';
  return options
    .map((o) => `${o.option}. ${o.id} ${o.title} (${o.class})${o.parallel ? ` ${PARALLEL}` : ''}${o.doneWhen ? `\n   Done-when: ${o.doneWhen}` : ''}`)
    .join('\n');
}
