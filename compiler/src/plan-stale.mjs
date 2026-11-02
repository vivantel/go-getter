// Plan staleness: `plan status|next` read docs/plans/ from the working tree, so a branch that predates a merge shows
// finished steps as open. Compares the branch with the default branch's plan files; read-only (a fetch, no checkout).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv, defaultBranch } from './git-env.mjs';
import { parsePlan, PLAN_DIR } from './plan.mjs';

const FETCH_TIMEOUT_MS = 15000;

const git = (root, args, opts = {}) => execFileSync('git', args, { cwd: root, env: cleanGitEnv(process.env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const posix = (p) => p.split(path.sep).join('/');

// { base, behind, stale, notice? } or { skipped } when there is nothing to compare with. A failed fetch (offline)
// compares with the last fetched default branch and says so.
export function planStaleness(root, { fetch = true } = {}) {
  const def = defaultBranch(root);
  if (!def?.known) return { skipped: 'the default branch is unknown (no origin/HEAD)' };
  const base = `origin/${def.name}`;
  let notice;
  if (fetch) {
    try {
      git(root, ['fetch', '--quiet', 'origin'], { timeout: FETCH_TIMEOUT_MS });
    } catch {
      notice = `fetch failed; compared with the last fetched ${base}`;
    }
  }
  try {
    const behind = Number(git(root, ['rev-list', '--count', `HEAD..${base}`, '--', posix(PLAN_DIR)]));
    return { base, behind, stale: behind > 0, ...(notice ? { notice } : {}) };
  } catch {
    return { skipped: `${base} is not available to compare with` };
  }
}

// The plan file as the default branch has it, parsed (step markers only: no tracker overlay).
export function planFromDefault(root, file, base) {
  const rel = posix(path.relative(root, file));
  return parsePlan(git(root, ['show', `${base}:${rel}`]), rel);
}

export function staleWarning(s, branch) {
  if (s.skipped) return `plan: staleness check skipped: ${s.skipped}`;
  const lines = [];
  if (s.stale) lines.push(`plan: warning: ${branch || 'this branch'} is behind ${s.base} by ${s.behind} commit${s.behind === 1 ? '' : 's'} touching ${posix(PLAN_DIR)}/; steps may be shown open that are done (use --from-default)`);
  if (s.notice) lines.push(`plan: ${s.notice}`);
  return lines.join('\n');
}
