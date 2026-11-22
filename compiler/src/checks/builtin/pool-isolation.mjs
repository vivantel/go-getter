// Guardrail work-happens-in-pool-worktrees: in a pool project's main checkout, with the answer `pool-only`, an edit or a command that
// changes anything is denied with `go-getter pool acquire` named, and raw `git worktree add|remove|prune` are denied in pool mode.
// A tier-3 run has nothing to check after the fact (`pool doctor` and `pool status` report where work sits).
export default function poolIsolation() {
  return { ok: true, message: 'enforced by the pre-tool hook' };
}
