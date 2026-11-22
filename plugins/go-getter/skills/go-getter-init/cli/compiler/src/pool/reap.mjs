// `pool reap`: frees claimed slots whose work is finished (merged.mjs decides). It never frees an open or closed-unmerged slot, and a
// merged slot holding uncommitted or unpushed work is archived to <pool>/backup/ first, with what was saved recorded in the result.
// Decisions (which may call `gh`) are made outside the lock; under it each slot is re-checked and then freed, so the lock is never held
// across the network. One fetch happens first.
import { execFileSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { clockNow } from '../work/ops.mjs';
import { fetchOrigin } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { ensurePoolRoot, poolRoot, readLease } from './lease.mjs';
import { withLock } from './lock.mjs';
import { decide } from './merged.mjs';
import { backup, free, unsaved } from './slots.mjs';
import { ownerOf } from './owner.mjs';
import { baseRef, mainCheckout, poolStatus, slotDir } from './state.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();

// [{slot, action: 'free' | 'keep', keep?, reason, backup?}] for every claimed slot.
export function reap(cwd, { dryRun = false, prs, log = () => {} } = {}) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  fetchOrigin(main);
  const target = baseRef(main, config);
  const now = clockNow();
  const plan = poolStatus(main).slots
    .filter((s) => s.state === 'claimed')
    .map((s) => ({ slot: s.slot, dir: s.dir, lease: s.lease, ...endedOwner(main, target, s, decide(main, { lease: s.lease, dir: s.dir, target, now, graceSeconds: config.claimGraceSeconds, ttlSeconds: config.sessionTtlSeconds, ...(prs && { prs }) })) }));
  const results = [];
  for (const p of plan) {
    if (!p.merged || dryRun) {
      results.push({ slot: p.slot, action: p.merged ? 'would-free' : 'keep', ...(p.keep && { keep: p.keep }), reason: p.reason });
      continue;
    }
    try {
      results.push(withLock(main, () => {
        const lease = readLease(main, p.slot);
        // Claimed again (or released) since the decision: leave it.
        if (!lease || lease.claimedAt !== p.lease.claimedAt || lease.branch !== p.lease.branch) return { slot: p.slot, action: 'keep', keep: 'changed', reason: 'the lease changed since it was read' };
        const baseSha = git(main, 'rev-parse', `${target}^{commit}`);
        const dir = slotDir(main, p.slot);
        const found = unsaved(dir, baseSha);
        let saved = null;
        if (found.dirty.length || found.unpushed.length) saved = backup(main, p.slot, dir, baseSha, found);
        free(main, p.slot, lease, baseSha, { merged: true });
        return { slot: p.slot, action: 'freed', reason: p.reason, ...(saved && { backup: saved, saved: { files: found.dirty.length, commits: found.unpushed.length } }) };
      }));
    } catch (err) {
      log(`${p.slot}: not freed: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
      results.push({ slot: p.slot, action: 'keep', keep: 'error', reason: String(err.message).trim().split('\n')[0] });
    }
  }
  return results;
}

// A lapsed owner (no sign of life past its lease and the claim grace) frees a slot that holds nothing unsaved, unless a pull request still
// needs it: open and closed-unmerged slots keep their reason. With unsaved work the slot stays, listed as orphaned.
function endedOwner(main, target, s, d) {
  if (d.merged || !['not-merged', 'idle'].includes(d.keep)) return d;
  const config = poolConfig(main);
  const owner = ownerOf(main, s.lease);
  if (owner.state !== 'lapsed' || owner.ageSeconds < config.claimGraceSeconds) return d;
  const found = unsaved(s.dir, git(main, 'rev-parse', `${target}^{commit}`));
  if (found.dirty.length || found.unpushed.length) return { merged: false, keep: 'orphaned', reason: `owner ended ${Math.round(owner.ageSeconds / 60)} min ago; ${found.dirty.length} changed files and ${found.unpushed.length} unpushed commits stay` };
  return { merged: true, reason: `owner ended ${Math.round(owner.ageSeconds / 60)} min ago; work is pushed and clean` };
}

// Starts a reap that outlives this process, logging to <pool>/reap.log; returns at once.
export function reapInBackground(cwd, cli) {
  const main = mainCheckout(cwd);
  ensurePoolRoot(main);
  const fd = openSync(path.join(poolRoot(main), 'reap.log'), 'a');
  spawn(process.execPath, [cli, 'pool', 'reap', '--sync'], { cwd, detached: true, stdio: ['ignore', fd, fd] }).unref();
}
