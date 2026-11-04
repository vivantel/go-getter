// The end-of-run report (decision 0130 item 9): what a run did and why it stopped, from the run record, the plan, git history,
// the telemetry cost and the approvals store. Ids, numbers, links and plan step titles only: no prompt, command or file content.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPlan } from '../plan.mjs';
import { originRepo } from '../trackers/github.mjs';
import { cleanGitEnv } from '../git-env.mjs';
import { spentUsd, spendCoverageOf } from './next.mjs';
import { settleSpend } from '../spend/index.mjs';

// The ref merges land on: the remote default branch, else a local main or master, else the current branch.
function defaultRef(project) {
  const git = (...a) => {
    try { return execFileSync('git', a, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) }).trim(); } catch { return ''; }
  };
  const head = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
  if (head) return head;
  return ['origin/main', 'origin/master', 'main', 'master'].find((r) => git('rev-parse', '--verify', '--quiet', `${r}^{commit}`)) ?? 'HEAD';
}

// Pull requests merged since the run started: the `(#N)` a squash merge puts in the subject of a commit on the default branch,
// whatever branch `run end` runs on.
function mergedPullRequests(project, since) {
  try {
    const out = execFileSync('git', ['log', '--first-parent', `--since=${since}`, '--format=%s', defaultRef(project)], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) });
    return [...new Set(out.split('\n').flatMap((subject) => /\(#([1-9][0-9]*)\)\s*$/.exec(subject)?.[1] ?? []))];
  } catch {
    return [];
  }
}

const COVERAGE_NOTES = { 'lower-bound': 'a lower bound: part of the usage is not read', 'shared-directory': 'includes other sessions in this directory' };

// The run's plan path relative to the project: where the record says, else the archive when the plan was finished and moved.
export function runPlanPath(project, run) {
  if (existsSync(path.join(project, run.plan))) return run.plan;
  const archived = path.posix.join(path.posix.dirname(run.plan), 'archive', path.posix.basename(run.plan));
  return existsSync(path.join(project, archived)) ? archived : run.plan;
}

// Markdown report of a finished run record. `project` is the repository root.
export function buildReport(project, run, { env = process.env, spendExec } = {}) {
  const repo = originRepo(project);
  const link = (kind, n) => (repo ? `[#${n}](https://github.com/${repo}/${kind}/${n})` : `#${n}`);
  const issueLink = (step) => {
    const ref = step.issueRef;
    if (!ref) return '';
    return ref.tracker === 'jira' ? ` (${ref.text})` : ` (${ref.repo ? ref.text : link('issues', ref.key)})`;
  };
  const plan = readPlan(path.join(project, runPlanPath(project, run)));
  const inRange = run.steps.map((id) => plan.steps.find((s) => s.id === id)).filter(Boolean);
  const done = inRange.filter((s) => s.state === 'done');
  const open = inRange.filter((s) => s.state !== 'done');
  const reasonFor = (s) => (run.stop?.step === s.id ? `${run.stop.code}: ${run.stop.reason}` : run.stop && !run.stop.step ? `${run.stop.code}: ${run.stop.reason}` : s.human ? `needs a person: ${s.human}` : `not reached (run ${run.endReason === 'timeout' ? 'timed out' : 'ended'})`);
  if (run.spendCapUsd && run.spendMetered !== false) settleSpend(project, run, undefined, spendExec);
  const spent = spentUsd(project, run);
  const notes = spendCoverageOf(project, run).map((c) => COVERAGE_NOTES[c]);
  const coverageNote = notes.length ? ` (${notes.join('; ')})` : '';
  const prs = mergedPullRequests(project, run.startedAt);
  const attempts = Object.entries(run.counters?.attempts ?? {});
  const denials = Object.entries(run.counters?.denials ?? {}).flatMap(([step, per]) => Object.entries(per).map(([id, n]) => `step ${step}: ${id} ×${n}`));
  const used = run.used ?? [];
  const lines = [
    `## Autonomous run report: ${run.plan}`,
    '',
    `Started ${run.startedAt}, ended ${run.endedAt}${run.endReason === 'timeout' ? ' (timed out)' : ''}.`,
    '',
    `**Steps done (${done.length}/${inRange.length})**`,
    ...(done.length ? done.map((s) => `- ${s.id} ${s.title}${issueLink(s)}`) : ['- none']),
    '',
    '**Not done**',
    ...(open.length ? open.map((s) => `- ${s.id} ${s.title}: ${reasonFor(s)}`) : ['- none']),
    '',
    `**Pull requests merged:** ${prs.length ? prs.map((n) => link('pull', n)).join(', ') : 'none'}`,
    `**Stops:** ${run.stop ? `${run.stop.code}${run.stop.step ? ` at step ${run.stop.step}` : ''}: ${run.stop.reason}` : 'none'}`,
    `**Denials:** ${denials.length ? denials.join('; ') : 'none'}`,
    `**Fix attempts:** ${attempts.length ? attempts.map(([s, n]) => `step ${s} ×${n}`).join('; ') : 'none'}`,
    run.spendMetered === false ? `**Spend:** not metered on this host; the cap of $${run.spendCapUsd} could not bind` : `**Spend:** $${spent.toFixed(2)}${run.spendCapUsd ? ` of a $${run.spendCapUsd} cap` : ' (no cap)'}${coverageNote}`,
    `**Approvals used:** ${used.length ? used.join(', ') : 'none'}`,
  ];
  return { text: `${lines.join('\n')}\n`, steps: inRange };
}

// The step whose issue receives the report: the last step of the range that has one.
export const reportStep = (steps) => [...steps].reverse().find((s) => s.issueRef)?.id ?? null;
