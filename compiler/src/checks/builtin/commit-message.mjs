// Commit subjects not yet on the base branch must match `pattern`. Base: args.base, else origin's default branch.
import { execFileSync } from 'node:child_process';

const git = (project, a) => execFileSync('git', a, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export default function commitMessage({ project, args }) {
  let subjects;
  try {
    const base = args.base ?? git(project, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    subjects = git(project, ['log', '--format=%s', `${base}..HEAD`]).split('\n').filter(Boolean);
  } catch {
    return { ok: true, message: 'no base branch to compare against' };
  }
  const re = new RegExp(args.pattern);
  const bad = subjects.filter((s) => !re.test(s));
  return bad.length ? { ok: false, message: `commit subjects not matching ${args.pattern}: ${bad.map((s) => JSON.stringify(s)).join(', ')}` } : { ok: true };
}
