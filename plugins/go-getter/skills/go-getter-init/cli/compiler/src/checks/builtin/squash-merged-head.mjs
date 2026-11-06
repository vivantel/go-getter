// Derived from "merge it by squash": the head of the default branch has one parent. A merge commit on the default branch means a pull request
// was merged by merge commit. Only the default branch is judged: a pull request's own CI ref is itself a merge commit, and a feature branch may merge freely.
import { execFileSync } from 'node:child_process';
import { defaultBranch, cleanGitEnv } from '../../git-env.mjs';

export default function squashMergedHead({ project, pushRefs }) {
  if (pushRefs && !process.env.GITHUB_ACTIONS) return { ok: true, message: 'before a push the default branch is not the target of a merge' };
  const inCi = Boolean(process.env.GITHUB_ACTIONS);
  if (inCi && process.env.GITHUB_EVENT_NAME !== 'push') return { ok: true, message: 'not a push to a branch' };
  const git = (...a) => execFileSync('git', a, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) }).trim();
  let branch;
  let parents;
  try {
    branch = inCi ? process.env.GITHUB_REF_NAME : git('branch', '--show-current');
    parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/).length - 1;
  } catch {
    return { ok: true, message: 'no commit to check' };
  }
  const known = defaultBranch(project);
  if (!known.known || !branch || branch !== known.name) return { ok: true, message: 'not the default branch' };
  return parents <= 1 ? { ok: true, message: 'the head commit has one parent' } : { ok: false, message: `the head of "${branch}" is a merge commit (${parents} parents); merge a pull request by squash` };
}
