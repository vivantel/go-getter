// `pool reap`: frees claimed slots whose work is finished (merged.mjs decides). It never frees a closed-unmerged slot, and frees an open-pull-request slot only after the owner has been gone `pushedFreeSeconds` with nothing unsaved, and a
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
        // A lapsed owner's slot is freed only while it still holds nothing unsaved: the owner may have woken since the decision.
        if (p.keepBranch && (found.dirty.length || found.unpushed.length)) return { slot: p.slot, action: 'keep', keep: 'orphaned', reason: 'the owner returned or added work since the decision' };
        let saved = null;
        if (found.dirty.length || found.unpushed.length) saved = backup(main, p.slot, dir, baseSha, found);
        free(main, p.slot, lease, baseSha, { merged: !p.keepBranch });
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
// needs it: closed-unmerged slots keep their reason, and an open pull request's slot is freed only after `pushedFreeSeconds` (the commits are pushed). With unsaved work the slot stays, listed as orphaned.
function endedOwner(main, target, s, d) {
  if (d.merged || !['not-merged', 'idle', 'open-pr'].includes(d.keep)) return d;
  const config = poolConfig(main);
  const owner = ownerOf(main, s.lease);
  // A pushed branch with an open pull request has its commits on the remote, so its slot is freed after a delay (a setting, 24h).
  const wait = d.keep === 'open-pr' ? config.pushedFreeSeconds : config.claimGraceSeconds;
  if (owner.state !== 'lapsed' || owner.ageSeconds < wait) return d;
  const found = unsaved(s.dir, git(main, 'rev-parse', `${target}^{commit}`));
  if (found.dirty.length || found.unpushed.length) return { merged: false, keep: 'orphaned', reason: `owner ended ${Math.round(owner.ageSeconds / 60)} min ago; ${found.dirty.length} changed files and ${found.unpushed.length} unpushed commits stay` };
  return { merged: true, keepBranch: true, reason: `owner ended ${Math.round(owner.ageSeconds / 60)} min ago; work is pushed and clean${d.keep === 'open-pr' ? ` (${d.reason}; acquire resumes the branch)` : ''}` };
}

// Starts a reap that outlives this process, logging to <pool>/reap.log; returns at once.
export function reapInBackground(cwd, cli) {
  const main = mainCheckout(cwd);
  ensurePoolRoot(main);
  const fd = openSync(path.join(poolRoot(main), 'reap.log'), 'a');
  spawn(process.execPath, [cli, 'pool', 'reap', '--sync'], { cwd, detached: true, stdio: ['ignore', fd, fd] }).unref();
}
