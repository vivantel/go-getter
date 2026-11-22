// go-getter worktree new <slug> [--branch <name>] [--from <ref>] | list [--json] | clean [--dry-run]
import { poolStatus } from '../pool/state.mjs';
import { newWorktree, listWorktrees, cleanWorktrees, poolMode } from '../worktree.mjs';

const USAGE = 'usage: go-getter worktree new <slug> [--branch <name>] [--from <ref>] | list [--json] | clean [--dry-run]';

export default function worktreeCommand({ args }) {
  const [sub, ...rest] = args;
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  try {
    if (sub === 'new') {
      const made = newWorktree(process.cwd(), rest[0], { branch: flag('--branch'), from: flag('--from') });
      console.log(`${made.path} (${made.branch})${made.existing ? ' (already exists)' : ''}`);
      return 0;
    }
    if (sub === 'list') {
      const trees = listWorktrees(process.cwd());
      if (poolMode(trees[0].path)) {
        const slots = poolStatus(process.cwd()).slots.map((x) => ({ slot: x.slot, state: x.state, path: x.dir, branch: x.branch ?? null, ...(x.lease?.description && { description: x.lease.description }) }));
        if (rest.includes('--json')) console.log(JSON.stringify(slots, null, 2));
        else for (const x of slots) console.log(`${x.path}\t${x.state}${x.branch ? `\t${x.branch}` : ''}${x.description ? `\t${x.description}` : ''}`);
        return 0;
      }
      if (rest.includes('--json')) console.log(JSON.stringify(trees, null, 2));
      else for (const t of trees) console.log(`${t.path}\t${t.branch ?? '(detached)'}${t.main ? '\t(main)' : ''}`);
      return 0;
    }
    if (sub === 'clean') {
      const dryRun = rest.includes('--dry-run');
      const plan = cleanWorktrees(process.cwd(), { dryRun });
      for (const t of plan) console.log(`${t.action === 'remove' ? (dryRun ? 'would remove' : 'removed') : 'kept'}\t${t.path}\t${t.reason}${t.action === 'remove' && !dryRun && !t.branchDeleted ? `; branch ${t.branch} kept` : ''}`);
      if (!plan.length) console.log('no managed worktrees');
      return 0;
    }
  } catch (err) {
    console.error(`worktree: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
    return 1;
  }
  console.error(USAGE);
  return 2;
}
