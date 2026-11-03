// go-getter plan status|next [plan] [--json] [--from-default] | start <id> [plan] [--worktree <slug>] | done <id> [plan] |
// issue create|comment|close <id> [plan] [--dry-run] [--text <t> | --stdin] [--reason completed|not-planned]:
// read a Markdown plan's steps, move one through its markers (decision 0069, plan A.2) and write to the step's GitHub issue (0117).
import path from 'node:path';
import { resolvePlan, activePlanFiles, planStatus, nextSteps, formatStatus, formatNext, startStep, doneStep, repoRoot, formatBrief } from '../plan.mjs';
import { trackerSource } from '../trackers/index.mjs';
import { planIssue, relPlan, VERBS } from '../trackers/write.mjs';
import { callSource } from '../trackers/worksource.mjs';
import { planStaleness, planFromDefault, staleWarning } from '../plan-stale.mjs';
import { cleanGitEnv } from '../git-env.mjs';
import { execFileSync } from 'node:child_process';

const USAGE = `usage: go-getter plan status|next [plan] [--json] [--from-default] | start <id> [plan] [--worktree <slug>] | done <id> [plan] | issue ${VERBS.join('|')} <id> [plan] [--dry-run] [--text <t> | --stdin] [--reason completed|not-planned]`;

function parseArgs(sub, rest) {
  const flags = { json: false };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json' && ['status', 'next'].includes(sub)) flags.json = true;
    else if (rest[i] === '--from-default' && ['status', 'next'].includes(sub)) flags.fromDefault = true;
    else if (rest[i] === '--worktree' && sub === 'start' && rest[i + 1] && !rest[i + 1].startsWith('--')) flags.worktree = rest[++i];
    else if (rest[i].startsWith('--')) return null;
    else positional.push(rest[i]);
  }
  const ids = ['start', 'done'].includes(sub) ? 1 : 0;
  if (positional.length < ids || positional.length > ids + 1) return null;
  return { ...flags, id: ids ? positional[0] : undefined, plan: positional[ids] };
}

// `plan issue <verb> <id> [plan] [flags]`: { verb, id, plan, dryRun, text, stdin, reason } or null.
// `--dry-run` may come first (`plan issue --dry-run create 6`): the host's ask rules match a write as `plan issue <verb> ...`
// from the verb on, so a dry run spelled this way never prompts and no write can be spelled to escape the rule. Any other
// flag comes after the verb.
function parseIssueArgs(args) {
  const lead = args[0] === '--dry-run';
  const [verb, ...more] = lead ? args.slice(1) : args;
  const o = { verb, dryRun: lead, stdin: false };
  const positional = [];
  for (let i = 0; i < more.length; i++) {
    const value = () => (more[i + 1] !== undefined ? more[++i] : null);
    if (more[i] === '--dry-run') o.dryRun = true;
    else if (more[i] === '--stdin') o.stdin = true;
    else if (more[i] === '--text' || more[i] === '--reason') o[more[i].slice(2)] = value();
    else if (more[i].startsWith('--')) return null;
    else positional.push(more[i]);
  }
  if (!VERBS.includes(verb) || positional.length < 1 || positional.length > 2 || o.text === null || o.reason === null) return null;
  if (o.stdin && o.text !== undefined) return null;
  return { ...o, id: positional[0], plan: positional[1] };
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, env: cleanGitEnv(process.env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function planCommand({ args, shared }) {
  const [sub, ...rest] = args;
  if (sub === 'issue') {
    const o = parseIssueArgs(rest);
    if (!o) {
      console.error(USAGE);
      return 2;
    }
    try {
      const cwd = process.cwd();
      const project = repoRoot(cwd);
      const file = resolvePlan(cwd, o.plan);
      const text = o.stdin ? await readStdin() : o.text;
      const r = await planIssue(project, file, relPlan(cwd, file), o.verb, o.id, { dryRun: o.dryRun, text, reason: o.reason });
      if (r.ok) console.log(r.message);
      else console.error(`plan issue ${o.verb}: ${r.error}`);
      return r.ok ? 0 : 1;
    } catch (err) {
      console.error(`plan issue ${o.verb}: ${err.message.split('\n')[0]}`);
      return 1;
    }
  }
  const opts = ['status', 'next', 'start', 'done'].includes(sub) ? parseArgs(sub, rest) : null;
  if (!opts) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.cwd();
  // status and next with no plan named read every active plan, one header each; start and done need a name.
  if (!opts.plan && !shared && (sub === 'status' || sub === 'next')) {
    const root = repoRoot(cwd);
    const active = activePlanFiles(root);
    if (active.length > 1) {
      if (opts.json) {
        console.error(`plan ${sub}: --json with several plans in docs/plans needs one named (${active.join(', ')})`);
        return 1;
      }
      // the plans share one staleness check, so the fetch and the warning happen once, not once per plan
      const stale = planStaleness(root);
      const warning = staleWarning(stale, currentBranch(cwd));
      if (warning) console.error(warning);
      let code = 0;
      let anyReady = false;
      for (const rel of active) {
        const lines = [];
        const { log, error } = console;
        console.log = (...a) => lines.push(a.join(' '));
        console.error = (...a) => lines.push(a.join(' '));
        let c;
        try {
          c = await planCommand({ args: [sub, path.join(root, rel), ...(opts.fromDefault ? ['--from-default'] : [])], shared: { stale } });
        } finally {
          console.log = log;
          console.error = error;
        }
        code = Math.max(code, c);
        const text = lines.join('\n');
        const empty = sub === 'next' && /^no step is ready/.test(text);
        if (!empty) anyReady = true;
        if (sub === 'status' || !empty) console.log(`== ${rel}\n${text}`);
      }
      if (sub === 'next' && !anyReady) console.log('no step is ready in any plan: every pending step needs one that is not done');
      return code;
    }
  }
  try {
    const file = resolvePlan(cwd, opts.plan);
    const rel = path.relative(cwd, file);
    const source = trackerSource(file, { project: repoRoot(cwd), name: rel });
    if (sub === 'start') {
      const known = await callSource(source, 'list');
      const states = known.ok ? new Map(known.result.steps.map((s) => [s.id, s.state])) : undefined;
      const r = startStep(cwd, file, opts.id, { worktree: opts.worktree, states });
      if (r.worktree) console.log(`${r.worktree.path} (${r.worktree.branch})`);
      console.log(r.changed ? `${opts.id}: [~] in ${path.relative(cwd, r.file)}` : `${opts.id}: already in progress`);
      console.log(`\n${formatBrief(r.file, opts.id, r.worktree ? r.worktree.path : repoRoot(cwd))}`);
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
    const stale = shared?.stale ?? planStaleness(repoRoot(cwd));
    const warning = shared ? null : staleWarning(stale, currentBranch(cwd));
    if (warning) console.error(warning);
    if (opts.fromDefault && stale.base) {
      const plan = planFromDefault(repoRoot(cwd), file, stale.base);
      const result = sub === 'status' ? planStatus(plan) : nextSteps(plan);
      console.log(opts.json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
      return 0;
    }
    const listed = await callSource(source, 'list');
    if (!listed.ok) {
      console.error(listed.error.code === 'invalid-plan' ? 'plan: the plan does not parse:' : `plan: ${listed.error.message}`);
      for (const p of listed.error.problems ?? []) console.error(`  ${p}`);
      return 1;
    }
    const plan = { file: rel, steps: listed.result.steps };
    const result = sub === 'status' ? planStatus(plan) : nextSteps(plan);
    if (sub === 'status' && opts.json) result.stale = stale.skipped ? null : stale.stale;
    console.log(opts.json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
    return 0;
  } catch (err) {
    console.error(`plan: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
    return 1;
  }
}
