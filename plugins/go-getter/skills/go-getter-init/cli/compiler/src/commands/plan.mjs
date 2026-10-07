// go-getter plan status|next [plan] [--json] | start <id> [plan] [--worktree <slug>] | done <id> [plan]:
// read a Markdown plan's steps and move one through its markers (decision 0069, plan A.2).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parsePlan, resolvePlan, planStatus, nextSteps, formatStatus, formatNext, startStep, doneStep } from '../plan.mjs';

const USAGE = 'usage: go-getter plan status|next [plan] [--json] | start <id> [plan] [--worktree <slug>] | done <id> [plan]';

function parseArgs(sub, rest) {
  const flags = { json: false };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json' && ['status', 'next'].includes(sub)) flags.json = true;
    else if (rest[i] === '--worktree' && sub === 'start' && rest[i + 1] && !rest[i + 1].startsWith('--')) flags.worktree = rest[++i];
    else if (rest[i].startsWith('--')) return null;
    else positional.push(rest[i]);
  }
  const ids = ['start', 'done'].includes(sub) ? 1 : 0;
  if (positional.length < ids || positional.length > ids + 1) return null;
  return { ...flags, id: ids ? positional[0] : undefined, plan: positional[ids] };
}

export default function planCommand({ args }) {
  const [sub, ...rest] = args;
  const opts = ['status', 'next', 'start', 'done'].includes(sub) ? parseArgs(sub, rest) : null;
  if (!opts) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.cwd();
  try {
    const file = resolvePlan(cwd, opts.plan);
    const rel = path.relative(cwd, file);
    if (sub === 'start') {
      const r = startStep(cwd, file, opts.id, { worktree: opts.worktree });
      if (r.worktree) console.log(`${r.worktree.path} (${r.worktree.branch})`);
      console.log(r.changed ? `${opts.id}: [~] in ${path.relative(cwd, r.file)}` : `${opts.id}: already in progress`);
      return 0;
    }
    if (sub === 'done') {
      const r = doneStep(cwd, file, opts.id);
      if (r.ok) {
        console.log(r.changed ? `${opts.id}: check passed; [x] in ${rel}` : `${opts.id}: already done`);
        return 0;
      }
      console.error(`${opts.id}: check failed (${r.check}); marker unchanged\n${r.output}`);
      return 1;
    }
    const plan = parsePlan(readFileSync(file, 'utf8'), rel);
    if (plan.problems.length) {
      console.error('plan: the plan does not parse:');
      for (const p of plan.problems) console.error(`  ${p}`);
      return 1;
    }
    const result = sub === 'status' ? planStatus(plan) : nextSteps(plan);
    console.log(opts.json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
    return 0;
  } catch (err) {
    console.error(`plan: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
    return 1;
  }
}
