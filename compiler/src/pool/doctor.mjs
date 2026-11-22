// `pool doctor`: repairs what a crash or a hand-made change left behind, and never deletes a directory. A non-worktree directory in a
// slot's place is moved aside to `orphan-<slot>-<time>`; a lease that points at nothing is dropped; a pending lease is finished when its
// slot is a worktree and dropped otherwise; dead worktree records are pruned. A second run finds nothing to do.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { clockNow } from '../work/ops.mjs';
import { listWorktrees } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { dropLease, leaseDir, pendingSlots, readLease, writeLease } from './lease.mjs';
import { withLock } from './lock.mjs';
import { slotDir, slotName, slotsRoot } from './state.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const real = (p) => { try { return realpathSync(p); } catch { return p; } };

function size(p) {
  let total = 0;
  try {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name);
      total += e.isDirectory() ? size(f) : statSync(f).size;
    }
  } catch { /* unreadable: counted as zero */ }
  return total;
}

// Returns [{action, slot?, path?, reason, bytes?}]; with `dryRun` nothing changes.
export function doctor(cwd, { dryRun = false } = {}) {
  const main = listWorktrees(cwd)[0].path;
  const config = poolConfig(main);
  const out = [];
  const act = (entry, fn) => { out.push(entry); if (!dryRun) fn(); };
  return withLock(main, () => {
    const dead = listWorktrees(main).filter((t) => t.prunable);
    if (dead.length) act({ action: 'prune', reason: `${dead.length} worktree record(s) whose directory is gone` }, () => git(main, 'worktree', 'prune'));
    const trees = listWorktrees(main);
    const isTree = (dir) => trees.some((t) => real(t.path) === real(dir));
    const stamp = clockNow().toISOString().replace(/[:.]/g, '-');
    for (let n = 1; n <= config.size; n++) {
      const slot = slotName(n);
      const dir = slotDir(main, slot);
      const lease = readLease(main, slot);
      if (existsSync(dir) && !isTree(dir)) {
        const to = path.join(slotsRoot(main), `orphan-${String(n).padStart(2, '0')}-${stamp}`);
        act({ action: 'move-aside', slot, path: dir, to, reason: 'a directory that is not a worktree sits in the slot', bytes: size(dir) }, () => renameSync(dir, to));
      }
      if (lease && !existsSync(dir)) {
        const branchRef = lease.branch && (() => { try { return git(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${lease.branch}`); } catch { return null; } })();
        if (!branchRef) act({ action: 'drop-lease', slot, reason: 'the lease points at no directory and no branch' }, () => dropLease(main, slot));
      }
    }
    for (const slot of pendingSlots(main)) {
      const file = path.join(leaseDir(main), `${slot}.pending.json`);
      const dir = slotDir(main, slot);
      if (existsSync(dir) && isTree(dir) && !readLease(main, slot)) {
        const { version, state, ...record } = JSON.parse(readFileSync(file, 'utf8'));
        act({ action: 'finish-claim', slot, reason: 'a claim was interrupted after its slot was made' }, () => writeLease(main, slot, record));
      } else act({ action: 'drop-pending', slot, reason: 'an interrupted claim with no slot behind it' }, () => rmSync(file, { force: true }));
    }
    return out;
  });
}
