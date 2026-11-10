// Derived from the orchestration guardrail "no more than N agents run at once per worker": a worker's linked worktrees never exceed N,
// the same limit `go-getter worktree new` applies (the pack answer `max-concurrent`; the `max` argument is the fallback when no answer is adopted),
// so a raw `git worktree add` cannot get past it. The main working tree and worktrees git marks prunable (directory gone) do not count.
import { listWorktrees, worktreeConfig } from '../../worktree.mjs';

export default function maxWorktrees({ project, args }) {
  const config = worktreeConfig(project);
  const max = config.maxAnswered ? config.max : Number(args.max);
  if (!Number.isInteger(max) || max < 1) return { ok: false, message: 'max must be a whole number of at least 1' };
  let linked;
  try {
    linked = listWorktrees(project).filter((t) => !t.main && !t.prunable).length;
  } catch {
    return { ok: true, message: 'not a git checkout; nothing to count' };
  }
  return linked <= max ? { ok: true, message: `${linked}/${max} linked worktrees` } : { ok: false, message: `${linked} linked worktrees exist; the limit is ${max} concurrent agents per worker (run "go-getter worktree clean")` };
}
