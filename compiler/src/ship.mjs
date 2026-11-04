// `go-getter ship` (decision 0157): commit to merge as one deterministic command. It checks the work, writes the
// commit message and pull request description (intent first, `Refs:` trailers from `go-getter refs`), pushes, opens the
// pull request, waits for CI and squash-merges only on green. No model is involved unless a review command is configured.
// Each step is a small function over an injectable runner, so tests drive the whole flow against a real repository and a
// fake `gh`.
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { cleanGitEnv, defaultBranch } from './git-env.mjs';
import { suggestRefs } from './refs.mjs';
import { runTier3 } from './enforce.mjs';
import { restrictedPatterns } from './hook.mjs';
import { matchesAny } from './glob.mjs';
import { createCheckpoint } from './checkpoint.mjs';

export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const SUBJECT = new RegExp(`^(?:${TYPES.join('|')})(?:\\([^)]+\\))?!?: \\S`);
const BRANCH = new RegExp(`^(${TYPES.join('|')})/([a-z0-9][a-z0-9._-]*)$`);
export const TRAILER = /^Refs: \S/m;

export class ShipError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export const defaultRunner = (cmd, args, { cwd, input } = {}) => {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: cleanGitEnv(process.env), stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.error) return { code: 127, out: '', err: r.error.message };
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
};

// The summary line a branch name implies: `feat/add-ship-verb` is `feat: add ship verb`.
export function titleFromBranch(branch) {
  const m = BRANCH.exec(branch);
  return m ? `${m[1]}: ${m[2].replace(/[._-]+/g, ' ').trim()}` : null;
}

export function buildMessage({ title, why, refs }) {
  const trailers = [...new Set(refs)].map((r) => `Refs: ${r}`);
  return [title, '', why.trim(), ...(trailers.length ? ['', ...trailers] : [])].join('\n');
}

export function buildPrBody({ why, refs, checks }) {
  const lines = ['## Intent', '', why.trim(), '', '## Checks', '', ...checks.map((c) => `- ${c}`)];
  if (refs.length) lines.push('', '## Refs', '', ...refs.map((r) => `- ${r}`));
  lines.push('', 'Opened by `go-getter ship`.');
  return lines.join('\n');
}

// 'success' | 'failure' | 'pending' | 'none' from `gh pr checks --json name,bucket`.
export function ciOutcome(rows) {
  if (!rows.length) return 'none';
  const buckets = rows.map((r) => r.bucket);
  if (buckets.some((b) => b === 'fail' || b === 'cancel')) return 'failure';
  if (buckets.some((b) => b === 'pending')) return 'pending';
  return 'success';
}

// Polls `gh pr checks` until the pull request's CI concludes: resolves 'success' or 'none' (no checks reported within the grace
// period); a failure, an unreadable status or a timeout throws. Shared by `pr`, `ship` and `release --batch`.
export async function waitForCi({ gh, pr, verb, intervalMs = 20_000, timeoutMs = 30 * 60_000, noCiGraceMs = 60_000, log = () => {} }) {
  const started = Date.now();
  let ci = 'success';
  for (;;) {
    const r = gh('pr', 'checks', String(pr.number), '--json', 'name,bucket');
    let rows;
    try {
      if (!r.out.trim()) throw new SyntaxError('empty');
      rows = JSON.parse(r.out);
    } catch {
      // gh printed no JSON: "no checks reported" means none yet; anything else (auth, network, rate limit) is an error, not a green light.
      if (!/no checks reported/i.test(`${r.out}${r.err}`)) throw new ShipError(`${verb}: could not read CI status: ${(r.err || r.out).trim().split('\n')[0] || `gh exit ${r.code}`}; the pull request stays open: ${pr.url}`, 1);
      rows = [];
    }
    const outcome = ciOutcome(rows);
    if (outcome === 'failure') throw new ShipError(`${verb}: CI failed on ${rows.filter((x) => x.bucket === 'fail' || x.bucket === 'cancel').map((x) => x.name).join(', ')}; the pull request stays open: ${pr.url}`, 1);
    if (outcome === 'success') {
      log('ci', `${rows.length} check${rows.length === 1 ? '' : 's'} green`);
      break;
    }
    if (outcome === 'none' && Date.now() - started >= noCiGraceMs) {
      log('ci', `no checks reported after ${Math.round(noCiGraceMs / 1000)}s`);
      ci = 'none';
      break;
    }
    if (Date.now() - started >= timeoutMs) throw new ShipError(`${verb}: CI still pending after ${Math.round(timeoutMs / 60_000)} min; the pull request stays open: ${pr.url}`, 3);
    await sleep(intervalMs);
  }
  return ci;
}

// `go-getter pr`: checks, checkpoint, commit, push, the pull request and the wait for CI. It never merges; `ship` is this plus the merge.
// Resolves with `ci` 'success' or 'none' (no checks reported in the grace period); a failure or a timeout throws.
export async function openPr(project, opts = {}, run = defaultRunner, log = () => {}) {
  const { verb = 'pr', title: titleArg, why: whyArg, dryRun = false, intervalMs = 20_000, timeoutMs = 30 * 60_000, noCiGraceMs = 60_000, review } = opts;
  const git = (...a) => run('git', a, { cwd: project });
  const gh = (...a) => run('gh', a, { cwd: project });
  const need = (r, what) => {
    if (r.code !== 0) throw new ShipError(`${what}: ${(r.err || r.out).trim().split('\n').slice(-3).join(' | ')}`);
    return r.out.trim();
  };
  const checks = [];

  // 1 Preflight: a branch of its own, a remote, the tools.
  const branch = need(git('branch', '--show-current'), 'git branch') || null;
  const base = defaultBranch(project);
  if (!branch) throw new ShipError(`${verb}: HEAD is detached; switch to a branch named <type>/<slug>`);
  if (branch === base.name) throw new ShipError(`${verb}: you are on the default branch (${base.name}); work happens on <type>/<slug> branches (guardrail no-commits-on-the-default-branch)`);
  if (!base.known) throw new ShipError(`${verb}: cannot tell the default branch (no origin/HEAD); run \`git remote set-head origin -a\``);
  if (git('remote', 'get-url', 'origin').code !== 0) throw new ShipError(`${verb}: no remote named origin`);
  if (gh('--version').code !== 0) throw new ShipError(`${verb}: the gh CLI is required (https://cli.github.com), and \`gh auth login\` must have been run`, 127);
  log('preflight', `branch ${branch} -> ${base.name}`);

  // 2 What is there to ship: uncommitted changes, commits ahead, or both.
  const status = need(git('status', '--porcelain'), 'git status').split('\n').filter(Boolean);
  const dirty = status.map((l) => l.slice(3).replace(/^"|"$/g, '').replace(/^.* -> /, ''));
  const ahead = Number(need(git('rev-list', '--count', `origin/${base.name}..HEAD`), 'git rev-list'));
  if (!dirty.length && !ahead) throw new ShipError(`${verb}: nothing to ship; ${branch} has no changes against origin/${base.name}`);
  const restricted = dirty.filter((f) => matchesAny(f, restrictedPatterns(project)));
  if (restricted.length) throw new ShipError(`${verb}: restricted paths changed, not staging: ${restricted.join(', ')} (guardrail restricted-paths-denied)`);
  log('scope', `${dirty.length} uncommitted file${dirty.length === 1 ? '' : 's'}, ${ahead} commit${ahead === 1 ? '' : 's'} ahead`);

  // 3 Checks: the adopted tier-3 guardrail checks, the same set as the pre-push hook.
  const results = await runTier3(project, { stage: 'pre-push' });
  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw new ShipError(`${verb}: checks failed: ${failed.map((r) => `${r.guardrail}${r.message ? ` (${r.message})` : ''}`).join('; ')}`);
  checks.push(`guardrail checks: ${results.length} passed`);
  log('checks', `${results.length} guardrail checks passed`);
  if (review) {
    const r = await review({ project, base: base.name });
    if (!r.ok) throw new ShipError(`${verb}: review found problems: ${r.summary}`);
    checks.push(`review: ${r.summary}`);
    log('review', r.summary);
  }

  // 4 Attribute: the message from what the branch already holds, else from the arguments.
  const firstSubject = ahead ? git('log', '--format=%s', '--reverse', `origin/${base.name}..HEAD`).out.split('\n')[0] : null;
  const title = titleArg ?? (dirty.length ? titleFromBranch(branch) : firstSubject);
  if (!title || !SUBJECT.test(title)) throw new ShipError(`${verb}: need a Conventional Commit title (type: summary); pass --title (branch ${branch} gives ${titleFromBranch(branch) ?? 'none'})`, 2);
  const existingBody = ahead ? git('log', '--format=%b', `origin/${base.name}..HEAD`).out.replace(/^Refs: .*$/gm, '').trim() : '';
  const why = whyArg ?? (existingBody || null);
  if (!why) throw new ShipError(`${verb}: say why the change is made (the intent) with --why "<text>"`, 2);
  const refs = suggestRefs(project, { base: `origin/${base.name}` }).must.map((r) => r.path);
  if (dryRun) {
    log('dry-run', `would ${verb === 'pr' ? 'open a pull request for' : 'ship'} "${title}" with ${refs.length} ref${refs.length === 1 ? '' : 's'}; nothing written`);
    return { dryRun: true, branch, title, refs };
  }

  // 5 A checkpoint first, so a bad ship can be undone (guardrail checkpoint-before-gated-action), then commit what is uncommitted; hooks (commit-msg, pre-commit) run as usual.
  const cp = createCheckpoint(project, { label: `ship ${branch}` });
  if (cp) log('checkpoint', cp.ref);
  if (dirty.length) {
    need(git('add', '-A'), 'git add');
    const staged = suggestRefs(project, { staged: true }).must.map((r) => r.path);
    const message = buildMessage({ title, why, refs: [...new Set([...refs, ...staged])] });
    need(git('commit', '-m', message), 'git commit');
    log('commit', title);
  }

  // 6 Push, then the pull request (reusing an open one for this branch).
  need(git('push', '-u', 'origin', 'HEAD'), 'git push');
  log('push', `origin/${branch}`);
  const existing = gh('pr', 'view', branch, '--json', 'number,url,state');
  let pr = existing.code === 0 ? JSON.parse(existing.out) : null;
  if (pr?.state !== 'OPEN') {
    const prRefs = suggestRefs(project, { base: `origin/${base.name}` }).must.map((r) => r.path); // after the commit: includes what it staged
    const body = buildPrBody({ why, refs: prRefs, checks });
    need(gh('pr', 'create', '--base', base.name, '--head', branch, '--title', title, '--body', body), 'gh pr create');
    pr = JSON.parse(need(gh('pr', 'view', branch, '--json', 'number,url,state'), 'gh pr view'));
  }
  log('pr', pr.url);

  // 7 CI: success merges, failure stops with the failing checks, no checks stops unless allowed.
  const ci = await waitForCi({ gh, pr, verb, intervalMs, timeoutMs, noCiGraceMs, log });
  return { branch, title, pr, ci, merged: false };
}

// `go-getter ship`: `pr` and then the squash merge on green. No CI at all stops it unless the project allows merging without.
export async function ship(project, opts = {}, run = defaultRunner, log = () => {}) {
  const { allowNoCi = false, ...rest } = opts;
  const opened = await openPr(project, { ...rest, verb: 'ship' }, run, log);
  if (opened.dryRun) return opened;
  const { pr } = opened;
  const git = (...a) => run('git', a, { cwd: project });
  const gh = (...a) => run('gh', a, { cwd: project });
  const need = (r, what) => {
    if (r.code !== 0) throw new ShipError(`${what}: ${(r.err || r.out).trim().split('\n').slice(-3).join(' | ')}`);
    return r.out.trim();
  };
  if (opened.ci === 'none') {
    if (!allowNoCi) throw new ShipError(`ship: no CI checks reported; merge by hand or pass --allow-no-ci: ${pr.url}`, 3);
    log('ci', 'no checks reported; continuing (--allow-no-ci)');
  }

  // 8 Merge by squash; gh may fail to switch branches in a worktree after merging, so the state decides.
  gh('pr', 'merge', String(pr.number), '--squash', '--delete-branch');
  const state = JSON.parse(need(gh('pr', 'view', String(pr.number), '--json', 'state'), 'gh pr view')).state;
  if (state !== 'MERGED') throw new ShipError(`ship: the pull request is ${state}, not merged: ${pr.url}`);
  log('merge', `squashed ${pr.url}`);
  git('fetch', 'origin', defaultBranch(project).name);
  return { ...opened, merged: true };
}


// The optional review pass (`--review`): a read-only Claude Code run over the diff against the base, answering on a last
// `VERDICT: PASS|FAIL <summary>` line. It gets no tools that write, and the brief names the decisions and guardrails to read.
export function claudeReview(run = defaultRunner) {
  return async ({ project, base }) => {
    const prompt = [
      `Review the change on this branch against origin/${base} (git diff origin/${base}...HEAD) as a strict, read-only reviewer.`,
      'Check it against the decisions and guardrails under docs/ that it touches or implements, look for correctness bugs and missing tests, and do not modify anything.',
      'End your answer with exactly one line: "VERDICT: PASS <one-sentence summary>" or "VERDICT: FAIL <the blocking problem>". Fail only for a real defect or a broken commitment, not for style.',
    ].join(' ');
    const r = run('claude', ['-p', prompt, '--permission-mode', 'plan', '--allowedTools', 'Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git show *)', '--max-budget-usd', '2'], { cwd: project });
    if (r.code === 127) throw new ShipError('ship: --review needs the claude CLI on PATH', 127);
    const m = /VERDICT:\s*(PASS|FAIL)\s*(.*)$/m.exec(r.out);
    if (!m) throw new ShipError(`ship: the review gave no verdict line (exit ${r.code}): ${(r.out || r.err).trim().split('\n').slice(-2).join(' | ')}`);
    return { ok: m[1] === 'PASS', summary: m[2].trim() || m[1].toLowerCase() };
  };
}
