// go-getter run start <plan> [--through N] [--hours H] [--grant <id>]... | status [--json] | end
// An autonomous run (decision 0130): a person starts it on a plan range; the record is read by the pre-tool hook. `start` and
// `end` change what an agent may do, so a person runs them; the hook refuses an agent's call to either.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { activeRun, lastRun, startRun, endRun, DEFAULT_HOURS } from '../runs/record.mjs';
import { readPlan, repoRoot } from '../plan.mjs';
import { CATALOG, normaliseFree } from '../gate.mjs';
import { loadPolicy } from '../routing/policy.mjs';
import { adoptedData } from '../governance.mjs';

const USAGE = 'usage: go-getter run start <plan> [--through N] [--hours H] [--grant <id>]... | status [--json] | end';
const OUTWARD = CATALOG.filter((e) => e.class === 'outward').map((e) => e.id);

function parseStart(rest) {
  const o = { grants: [] };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const value = () => (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : null);
    if (rest[i] === '--through') o.through = value();
    else if (rest[i] === '--hours') o.hours = Number(value());
    else if (rest[i] === '--grant') o.grants.push(value());
    else if (rest[i].startsWith('--')) return null;
    else positional.push(rest[i]);
  }
  if (positional.length !== 1 || o.through === null || o.grants.includes(null) || (o.hours !== undefined && Number.isNaN(o.hours))) return null;
  return { ...o, plan: positional[0] };
}

const describe = (r) => `plan ${r.plan}, steps ${r.steps.join(', ')} (through ${r.through}), started ${r.startedAt}, times out ${r.timeoutAt}${r.spendCapUsd ? `, spend cap $${r.spendCapUsd}` : ''}${r.grants.length ? `, grants: ${r.grants.join(', ')}` : ''}`;

export default function runCommand({ args }) {
  const [sub, ...rest] = args;
  const project = repoRoot(process.cwd());
  try {
    if (sub === 'status' && rest.every((a) => a === '--json')) {
      const active = activeRun(project);
      if (rest.includes('--json')) console.log(JSON.stringify({ active, last: lastRun(project) }, null, 2));
      else console.log(active ? `run active: ${describe(active)}` : 'no run is active');
      return 0;
    }
    if (sub === 'end' && !rest.length) {
      const done = endRun(project, { reason: 'ended' });
      console.log(done ? `run ended: ${describe(done)}` : 'no run is active');
      return done ? 0 : 1;
    }
    if (sub === 'start') {
      const o = parseStart(rest);
      if (!o) {
        console.error(USAGE);
        return 2;
      }
      const file = path.resolve(project, o.plan);
      if (!existsSync(file)) throw new Error(`no plan at ${o.plan}`);
      const plan = readPlan(file);
      const ids = plan.steps.map((s) => s.id);
      if (o.through !== undefined && !ids.includes(o.through)) throw new Error(`the plan has no step ${o.through}`);
      // The range: the steps not yet done, from the first to --through (default: the last step).
      const last = o.through === undefined ? ids.length - 1 : ids.indexOf(o.through);
      const steps = plan.steps.slice(0, last + 1).filter((s) => ['pending', 'in progress', 'blocked'].includes(s.state)).map((s) => s.id);
      if (!steps.length) throw new Error('no step is left to do in that range');
      // Without --grant, the shapes the project's hitl answer lists.
      const grants = normaliseFree(o.grants.length ? o.grants : [].concat(adoptedData(project, 'run-grants') ?? []));
      const bad = grants.filter((g) => !OUTWARD.includes(g));
      if (bad.length) throw new Error(`--grant takes outward catalog ids (${OUTWARD.join(', ')}), not ${bad.join(', ')}`);
      const record = startRun(project, { plan: path.relative(project, file).split(path.sep).join('/'), steps, through: steps.at(-1), hours: o.hours ?? DEFAULT_HOURS, spendCapUsd: loadPolicy(project)?.spendCapUsd ?? null, grants });
      console.log(`run started: ${describe(record)}`);
      return 0;
    }
  } catch (err) {
    console.error(`run: ${err.message.split('\n')[0]}`);
    return 1;
  }
  console.error(USAGE);
  return 2;
}
