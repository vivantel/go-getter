// Derived from the orchestration guardrail "no more than N agents run at once per worker": a worker's linked worktrees never exceed N,
// the same limit `go-getter worktree new` applies, so a raw `git worktree add` cannot get past it. The main working tree does not count.
import { listWorktrees } from '../../worktree.mjs';

export default function maxWorktrees({ project, args }) {
  const max = Number(args.max);
  if (!Number.isInteger(max) || max < 1) return { ok: false, message: 'max must be a whole number of at least 1' };
  let linked;
  try {
    linked = listWorktrees(project).filter((t) => !t.main).length;
  } catch {
    return { ok: true, message: 'not a git checkout; nothing to count' };
  }
  return linked <= max ? { ok: true, message: `${linked}/${max} linked worktrees` } : { ok: false, message: `${linked} linked worktrees exist; the limit is ${max} concurrent agents per worker (run "go-getter worktree clean")` };
}
