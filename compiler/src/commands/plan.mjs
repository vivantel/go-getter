// go-getter plan status|next [plan] [--json]: read a Markdown plan's steps (decision 0069, plan A.2).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parsePlan, resolvePlan, planStatus, nextSteps, formatStatus, formatNext } from '../plan.mjs';

const USAGE = 'usage: go-getter plan status|next [plan] [--json]';

export default function planCommand({ args }) {
  const [sub, ...rest] = args;
  const json = rest.includes('--json');
  const positional = rest.filter((a) => a !== '--json');
  if (!['status', 'next'].includes(sub) || positional.length > 1 || positional.some((a) => a.startsWith('--'))) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.cwd();
  let plan;
  try {
    const file = resolvePlan(cwd, positional[0]);
    plan = parsePlan(readFileSync(file, 'utf8'), path.relative(cwd, file));
  } catch (err) {
    console.error(`plan: ${err.message}`);
    return 1;
  }
  if (plan.problems.length) {
    console.error('plan: the plan does not parse:');
    for (const p of plan.problems) console.error(`  ${p}`);
    return 1;
  }
  const result = sub === 'status' ? planStatus(plan) : nextSteps(plan);
  console.log(json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
  return 0;
}
