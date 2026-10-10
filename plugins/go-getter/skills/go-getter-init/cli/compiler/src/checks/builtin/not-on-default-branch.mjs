// Fails when the work is on the project's default branch, so a commit or push goes through a branch and a pull request.
// In CI only a pull request's head branch counts (GITHUB_HEAD_REF): a push to the default branch is the merge itself.
// Passes when the default branch is not known (no origin/HEAD), since the checked-out branch would then be a guess.
import { execFileSync } from 'node:child_process';
import { defaultBranch, cleanGitEnv } from '../../git-env.mjs';

export default function notOnDefaultBranch({ project, args }) {
  const inCi = Boolean(process.env.GITHUB_ACTIONS);
  let branch = process.env.GITHUB_HEAD_REF || '';
  if (!branch && !inCi) {
    try {
      branch = execFileSync('git', ['branch', '--show-current'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) }).trim();
    } catch {
      branch = '';
    }
  }
  if (!branch) return { ok: true, message: 'no branch to check (detached HEAD or a push in CI)' };
  const known = defaultBranch(project);
  if (!known.known) return { ok: true, message: 'default branch not known' };
  if (String(args.allow ?? '').split(',').filter(Boolean).includes(branch)) return { ok: true };
  return branch === known.name ? { ok: false, message: `"${branch}" is the default branch; work on a branch and open a pull request` } : { ok: true };
}
