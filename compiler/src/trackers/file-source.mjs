// The file WorkSource: a Markdown plan in docs/plans (decision 0069). Reading and writing go through plan.mjs's parser and
// marker writer; this module only adapts them to the contract in worksource.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePlan, setMarker, MARKERS, ID } from '../plan.mjs';
import { ok, fail, STATES } from './worksource.mjs';

const MARKER_OF = Object.fromEntries(Object.entries(MARKERS).map(([marker, state]) => [state, marker]));
const CLASSES_LINE = /^[A-Za-z][A-Za-z-]*$/;

// A parsed step as plain data, without the file-only `line`; optional keys are left out, never undefined.
export function stepData(s) {
  const step = { id: s.id, title: s.title, state: s.state, parallel: s.parallel, class: s.class, needs: [...s.needs], fields: { ...s.fields } };
  for (const key of ['effort', 'tier', 'data', 'check', 'doneWhen']) if (s[key] !== undefined) step[key] = s[key];
  if (s.fields.Issue !== undefined) step.issue = s.fields.Issue;
  return step;
}

// `name` is how the plan is shown in messages (a project-relative path); it defaults to the file.
export function fileSource(file, { name = file } = {}) {
  const read = () => parsePlan(readFileSync(file, 'utf8'), name);
  const parsed = () => {
    const plan = read();
    return plan.problems.length ? { error: fail('invalid-plan', `the plan does not parse: ${plan.problems[0]}`, { problems: plan.problems }) } : { plan };
  };
  return {
    id: 'file',
    ops: ['list', 'get', 'create', 'setState'],
    handle(op, args) {
      const { plan, error } = parsed();
      if (error) return error;
      if (op === 'list') return ok({ steps: plan.steps.map(stepData) });
      if (op === 'create') return create(plan, args);
      const step = plan.steps.find((s) => s.id === args.id);
      if (typeof args.id !== 'string') return fail('invalid-args', `${op} needs an id`);
      if (!step) return fail('unknown-step', `no step ${args.id} in ${name}`);
      if (op === 'get') return ok({ step: stepData(step) });
      if (!STATES.includes(args.state)) return fail('invalid-args', `unknown state "${args.state}" (${STATES.join(', ')})`);
      const text = setMarker(readFileSync(file, 'utf8'), step, MARKER_OF[args.state]);
      writeFileSync(file, text);
      return ok({ step: stepData(parsePlan(text, name).steps.find((s) => s.id === step.id)) });
    },
  };

  function create(plan, { id, title, class: cls, needs = [], doneWhen }) {
    if (typeof id !== 'string' || !ID.test(id)) return fail('invalid-args', 'create needs an id (dotted alphanumeric)');
    if (typeof title !== 'string' || !title.trim() || /[\n\r]/.test(title) || title.includes(' — [')) return fail('invalid-args', 'create needs a one-line title');
    if (plan.steps.some((s) => s.id === id)) return fail('invalid-args', `step ${id} already exists`);
    if (cls !== undefined && !CLASSES_LINE.test(cls)) return fail('invalid-args', 'class is a plain word');
    if (!Array.isArray(needs) || needs.some((n) => typeof n !== 'string' || !plan.steps.some((s) => s.id === n))) return fail('invalid-args', 'needs lists existing step ids');
    if (doneWhen !== undefined && (typeof doneWhen !== 'string' || /[\n\r]/.test(doneWhen))) return fail('invalid-args', 'doneWhen is one line');
    const meta = [cls ? `Class: ${cls}` : null, needs.length ? `Needs: ${needs.join(', ')}` : null].filter(Boolean).join(' · ');
    const block = [`### ${id} ${title.trim()} — [ ]`, meta, doneWhen ? `Done-when: ${doneWhen}` : null].filter(Boolean).join('\n');
    const old = readFileSync(file, 'utf8');
    const text = `${old.replace(/\n*$/, '')}\n\n${block}\n`;
    const after = parsePlan(text, name);
    if (after.problems.length) return fail('invalid-args', `the step would not parse: ${after.problems[0]}`);
    writeFileSync(file, text);
    return ok({ step: stepData(after.steps.find((s) => s.id === id)) });
  }
}
