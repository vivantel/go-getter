// go-getter plan status|next [plan] [--json] [--from-default] | start <id> [plan] [--worktree <slug>] | done <id> [plan] |
// issue create|comment|close <id> [plan] [--dry-run] [--text <t> | --stdin] [--reason completed|not-planned]:
// read a Markdown plan's steps, move one through its markers (decision 0069, plan A.2) and write to the step's GitHub issue (0117).
import path from 'node:path';
import { format } from 'node:util';
import { resolvePlan, activePlanFiles, planStatus, nextSteps, unitStates, formatStatus, formatNext, startStep, doneStep, repoRoot, formatBrief } from '../plan.mjs';
import { trackerSource } from '../trackers/index.mjs';
import { planIssue, relPlan, VERBS } from '../trackers/write.mjs';
import { callSource } from '../trackers/worksource.mjs';
import { planStaleness, planFromDefault, staleWarning } from '../plan-stale.mjs';
import { cleanGitEnv } from '../git-env.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { draftPlan, approvePlan, defaultPlanner, defaultReviewer, commandRunner } from '../plan-draft.mjs';

const USAGE = `usage: go-getter plan status|next [plan] [--json] [--from-default] | start <id> [plan] [--worktree <slug>] | done <id> [plan] | issue ${VERBS.join('|')} <id> [plan] [--dry-run] [--text <t> | --stdin] [--reason completed|not-planned] | draft "<goal>" [--planner <cmd>] [--reviewer <cmd>] [--risk <file>] | approve [plan]`;

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

export default async function planCommand({ args, shared, io }) {
  // status and next write through `io` so the all-plans read can keep each plan's stdout and stderr apart
  const out = io?.out ?? console.log;
  const err = io?.err ?? console.error;
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
  if (sub === 'draft') {
    const o = { goal: [] };
    for (let i = 0; i < rest.length; i++) {
      if (['--planner', '--reviewer', '--risk'].includes(rest[i]) && rest[i + 1] !== undefined) o[rest[i].slice(2)] = rest[++i];
      else if (rest[i].startsWith('--')) o.bad = true;
      else o.goal.push(rest[i]);
    }
    if (o.bad || o.goal.length !== 1) {
      console.error(USAGE);
      return 2;
    }
    try {
      const project = repoRoot(process.cwd());
      const r = await draftPlan(project, o.goal[0], {
        planner: o.planner ? commandRunner(o.planner, project) : defaultPlanner,
        reviewer: o.reviewer ? commandRunner(o.reviewer, project) : defaultReviewer,
        risk: o.risk ? JSON.parse(readFileSync(path.resolve(o.risk), 'utf8')) : {},
      });
      if (r.stopped) {
        console.error(`plan draft: stopped at "${r.stopped.question}": ${r.stopped.triggers.map((t) => `${t.trigger} (${t.reason})`).join('; ')}`);
        return 3;
      }
      const rel = path.relative(process.cwd(), r.file);
      console.log(`${rel}: ${r.steps} steps, ${r.defaulted.length} defaulted decision${r.defaulted.length === 1 ? '' : 's'} logged as drafts\nnot started: a person approves the plan once with: go-getter plan approve ${rel}`);
      return 0;
    } catch (e) {
      console.error(`plan draft: ${e.message.split('\n')[0]}`);
      return 1;
    }
  }
  if (sub === 'approve') {
    if (rest.length > 1 || rest[0]?.startsWith('--')) {
      console.error(USAGE);
      return 2;
    }
    try {
      const file = resolvePlan(process.cwd(), rest[0]);
      const by = process.env.GIT_AUTHOR_NAME || execFileSync('git', ['config', 'user.name'], { env: cleanGitEnv(process.env), encoding: 'utf8' }).trim();
      const r = approvePlan(file, { by });
      console.log(r.changed ? `${path.relative(process.cwd(), file)}: ${r.text}` : `already ${r.text}`);
      return 0;
    } catch (e) {
      console.error(`plan approve: ${e.message.split('\n')[0]}`);
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
        const stdout = [];
        const stderr = [];
        const io = { out: (...a) => stdout.push(format(...a)), err: (...a) => stderr.push(format(...a)) };
        const c = await planCommand({ args: [sub, path.join(root, rel), ...(opts.fromDefault ? ['--from-default'] : [])], shared: { stale }, io });
        code = Math.max(code, c);
        const text = stdout.join('\n');
        const empty = sub === 'next' && c === 0 && /^no step is ready/.test(text);
        if (!empty) anyReady = true;
        if (sub === 'status' || !empty || c !== 0) console.log(`== ${rel}${text ? `\n${text}` : ''}`);
        for (const line of stderr) console.error(line);
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
    if (warning) err(warning);
    if (opts.fromDefault && stale.base) {
      const plan = planFromDefault(repoRoot(cwd), file, stale.base);
      const result = sub === 'status' ? planStatus(plan) : nextSteps(plan, undefined, unitStates(repoRoot(cwd)));
      out(opts.json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
      return 0;
    }
    const listed = await callSource(source, 'list');
    if (!listed.ok) {
      err(listed.error.code === 'invalid-plan' ? 'plan: the plan does not parse:' : `plan: ${listed.error.message}`);
      for (const p of listed.error.problems ?? []) err(`  ${p}`);
      return 1;
    }
    const plan = { file: rel, steps: listed.result.steps };
    const result = sub === 'status' ? planStatus(plan) : nextSteps(plan, undefined, unitStates(repoRoot(cwd)));
    if (sub === 'status' && opts.json) result.stale = stale.skipped ? null : stale.stale;
    out(opts.json ? JSON.stringify(result, null, 2) : sub === 'status' ? formatStatus(result) : formatNext(result));
    return 0;
  } catch (e) {
    err(`plan: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}
