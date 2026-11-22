// Slot states (plan docs/plans/worktree-pool.md, WP3): cold (no directory), free (detached, on or behind the base, no tracked change,
// every untracked file ignored or listed as scratch, no lease), claimed (a lease) and unmanaged (anything else; always with a reason,
// and work is never freed on a guess). `available` is free plus cold, the one figure that says how many slots can be handed out.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { listWorktrees } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { hasPending, readLease } from './lease.mjs';

const raw = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) });
const tryRun = (cwd, ...args) => { try { return raw(cwd, ...args).trim(); } catch { return null; } };
const real = (p) => { try { return realpathSync(p); } catch { return p; } };

export const slotName = (n) => `pool-${String(n).padStart(2, '0')}`;
export const mainCheckout = (cwd) => listWorktrees(cwd)[0].path;
export const slotsRoot = (main) => path.join(path.dirname(main), `${path.basename(main)}-wt`);
export const slotDir = (main, slot) => path.join(slotsRoot(main), slot);

// The ref a slot starts from: the configured base on origin, else origin's default branch, else a local main or master.
export function baseRef(main, config) {
  const candidates = [config.base && `origin/${config.base}`, config.base, tryRun(main, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'), 'origin/main', 'origin/master', 'main', 'master'].filter(Boolean);
  const found = candidates.find((r) => tryRun(main, 'rev-parse', '--verify', '--quiet', `${r}^{commit}`));
  if (!found) throw new Error('pool: no base branch found; set the pool base answer');
  return found;
}

// Does `file` (a path relative to the slot) match a scratch pattern? `dist/` or `dist` matches the directory and what is under it;
// `*` matches within one path segment, `**` across segments.
export function isScratch(file, patterns) {
  return patterns.some((pat) => {
    const p = pat.replace(/^\.?\//, '').replace(/\/$/, '');
    if (!p) return false;
    const re = new RegExp(`^${p.split('**').map((part) => part.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}(/.*)?$`);
    return re.test(file);
  });
}

// What stops a slot with no lease from being free, or null when it is free. `base` is the base commit.
export function whyNotFree(dir, config, base) {
  const lines = raw(dir, 'status', '--porcelain', '-uall').split('\n').filter(Boolean);
  const tracked = lines.filter((l) => !l.startsWith('??'));
  if (tracked.length) return { reason: 'dirty-tracked', files: tracked.slice(0, 3).map((l) => l.slice(3)) };
  const strange = lines.filter((l) => l.startsWith('??')).map((l) => l.slice(3).replace(/^"|"$/g, '')).filter((f) => !isScratch(f, config.scratch));
  if (strange.length) return { reason: 'untracked-unknown', files: strange.slice(0, 3) };
  const ahead = (tryRun(dir, 'rev-list', '--count', 'HEAD', '--not', base) ?? '0') !== '0';
  if (ahead) return { reason: 'no-lease-has-commits' };
  return null;
}

export function classify(main, config, n, { trees = listWorktrees(main), base = baseRef(main, config) } = {}) {
  const slot = slotName(n);
  const dir = slotDir(main, slot);
  const lease = readLease(main, slot);
  if (lease) return { slot, dir, state: 'claimed', lease, branch: lease.branch ?? null };
  if (hasPending(main, slot)) return { slot, dir, state: 'unmanaged', reason: 'pending-lease' };
  if (!existsSync(dir)) return { slot, dir, state: 'cold' };
  const tree = trees.find((t) => real(t.path) === real(dir));
  if (!tree) return { slot, dir, state: 'unmanaged', reason: 'not-a-worktree' };
  if (tree.branch) return { slot, dir, state: 'unmanaged', reason: 'no-lease-has-branch', branch: tree.branch };
  const why = whyNotFree(dir, config, base);
  if (why) return { slot, dir, state: 'unmanaged', reason: why.reason, ...(why.files && { files: why.files }) };
  return { slot, dir, state: 'free' };
}

export function poolStatus(cwd) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  const trees = listWorktrees(main);
  const base = baseRef(main, config);
  const slots = Array.from({ length: config.size }, (_, i) => classify(main, config, i + 1, { trees, base }));
  const counts = Object.fromEntries(['cold', 'free', 'claimed', 'unmanaged'].map((s) => [s, slots.filter((x) => x.state === s).length]));
  return { main, config, slots, counts, available: counts.free + counts.cold };
}
