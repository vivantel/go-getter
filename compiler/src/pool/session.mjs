// Sessions and heartbeats of pool slots: `name` turns an unnamed session slot into a branch, `end-session` frees a finished slot, and
// `touch` (run after every go-getter verb, like the claim renewal) records that the owner is alive.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { clockNow } from '../work/ops.mjs';
import { poolConfig } from './config.mjs';
import { readLease, updateLease } from './lease.mjs';
import { withLock } from './lock.mjs';
import { backup, free, unsaved } from './slots.mjs';
import { baseRef, mainCheckout, slotDir, slotsRoot } from './state.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const real = (p) => { try { return realpathSync(p); } catch { return p; } };

// The pool slot a directory is in, or null.
export function slotOf(cwd) {
  let top;
  try { top = real(git(cwd, 'rev-parse', '--show-toplevel')); } catch { return null; }
  const main = mainCheckout(top);
  const rel = path.relative(real(slotsRoot(main)), top);
  return /^pool-\d+$/.test(rel) ? { main, slot: rel, dir: top } : null;
}

// Marks the lease of the slot `cwd` is in as alive. Best effort, at most one write per minute, never waits for the lock.
export function touch(cwd) {
  const at = slotOf(cwd);
  if (!at) return false;
  const lease = readLease(at.main, at.slot);
  const now = clockNow();
  if (!lease || (lease.heartbeatAt && now - Date.parse(lease.heartbeatAt) < 60000)) return false;
  try {
    return withLock(at.main, () => updateLease(at.main, at.slot, { heartbeatAt: now.toISOString() }), { waitMs: 300 });
  } catch {
    return false;
  }
}

// Gives the unnamed session slot a branch, started on the base.
export function name(cwd, branch, { slot } = {}) {
  const here = slotOf(cwd);
  const main = here?.main ?? mainCheckout(cwd);
  const target = slot ?? here?.slot;
  if (!target) throw new Error('pool name: run it inside a slot or give --slot <pool-NN>');
  const config = poolConfig(main);
  if (!new RegExp(config.branchPattern).test(branch)) throw new Error(`branch "${branch}" does not match the pool's branch pattern ${config.branchPattern}`);
  return withLock(main, () => {
    const lease = readLease(main, target);
    if (!lease) throw new Error(`${target} holds no lease`);
    if (lease.branch) throw new Error(`${target} is already named ${lease.branch}`);
    const dir = slotDir(main, target);
    git(dir, 'switch', '-q', '-c', branch);
    updateLease(main, target, { branch });
    return { slot: target, path: dir, branch };
  });
}

// The session ended. Frees its slot when that loses nothing: an unnamed slot with no changes, or a named one that is pushed and clean.
// Otherwise the slot stays claimed and is marked `ended`, which `status` lists as orphaned. `force` with `doBackup` archives and frees.
export function endSession(cwd, session, { backup: doBackup = false } = {}) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  return withLock(main, () => {
    const slots = Array.from({ length: config.size }, (_, i) => `pool-${String(i + 1).padStart(2, '0')}`);
    const slot = slots.find((s) => readLease(main, s)?.session === session);
    if (!slot) return { session, action: 'none', reason: 'no slot is held by this session' };
    const lease = readLease(main, slot);
    const dir = slotDir(main, slot);
    const baseSha = git(main, 'rev-parse', `${baseRef(main, config)}^{commit}`);
    const found = existsSync(dir) ? unsaved(dir, baseSha) : { dirty: [], unpushed: [] };
    if (found.dirty.length || found.unpushed.length) {
      if (!doBackup) {
        updateLease(main, slot, { ended: clockNow().toISOString() });
        return { session, slot, action: 'kept', reason: `owner ended; ${found.dirty.length} changed files and ${found.unpushed.length} unpushed commits stay in ${slot}` };
      }
      const saved = backup(main, slot, dir, baseSha, found);
      free(main, slot, lease, baseSha);
      return { session, slot, action: 'freed', backup: saved };
    }
    free(main, slot, lease, baseSha);
    return { session, slot, action: 'freed', reason: lease.branch ? 'named, pushed and clean' : 'unnamed and clean' };
  });
}
