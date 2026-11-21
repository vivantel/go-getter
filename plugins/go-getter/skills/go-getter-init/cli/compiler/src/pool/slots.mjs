// Pool slots: `<main>-wt/pool-NN` (the sibling location of decision 0041). A slot is cold (no directory), free (detached on the base,
// clean, no lease), claimed (a lease) or unmanaged (anything else, with a reason). WP3 refines the free test and the reasons.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { identity } from '../work/ops.mjs';
import { fetchOrigin, listWorktrees } from '../worktree.mjs';
import { withLock } from './lock.mjs';
import { backupDir, dropLease, ensurePoolRoot, hasPending, pendingSlots, readLease, writeLease } from './lease.mjs';
import { poolConfig } from './config.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tryRun = (cwd, ...args) => { try { return run(cwd, ...args); } catch { return null; } };
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

export function inspect(main, config, n) {
  const slot = slotName(n);
  const dir = slotDir(main, slot);
  const lease = readLease(main, slot);
  const tree = listWorktrees(main).find((t) => real(t.path) === real(dir));
  if (lease) return { slot, dir, state: 'claimed', lease, branch: lease.branch ?? null };
  if (hasPending(main, slot)) return { slot, dir, state: 'unmanaged', reason: 'pending-lease' };
  if (!existsSync(dir)) return { slot, dir, state: 'cold' };
  if (!tree) return { slot, dir, state: 'unmanaged', reason: 'not-a-worktree' };
  if (tree.branch) return { slot, dir, state: 'unmanaged', reason: 'no-lease-has-branch' };
  if (run(dir, 'status', '--porcelain')) return { slot, dir, state: 'unmanaged', reason: 'dirty' };
  return { slot, dir, state: 'free' };
}

export function poolStatus(cwd) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  const slots = Array.from({ length: config.size }, (_, i) => inspect(main, config, i + 1));
  const counts = Object.fromEntries(['cold', 'free', 'claimed', 'unmanaged'].map((s) => [s, slots.filter((x) => x.state === s).length]));
  return { main, config, slots, counts, available: counts.free + counts.cold };
}

// Claims the lowest usable slot for `branch` (named) or `session` (unnamed).
export function acquire(cwd, { branch, session } = {}) {
  if (!branch === !session) throw new Error('pool acquire: give --branch <name> or --session <id>');
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  if (branch && !new RegExp(config.branchPattern).test(branch)) throw new Error(`branch "${branch}" does not match the pool's branch pattern ${config.branchPattern}`);
  fetchOrigin(main); // outside the lock: the network is never called while holding it
  return withLock(main, () => {
    if (branch && tryRun(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)) throw new Error(`branch "${branch}" already exists; release or reuse its slot`);
    const status = poolStatus(main);
    const target = status.slots.find((s) => s.state === 'cold' || s.state === 'free');
    if (!target) throw new Error(`the pool is full: ${status.counts.claimed} of ${config.size} slots are claimed${status.counts.unmanaged ? ` and ${status.counts.unmanaged} are unmanaged (run "go-getter pool status")` : ''}`);
    const ref = baseRef(main, config);
    const baseSha = run(main, 'rev-parse', `${ref}^{commit}`);
    ensurePoolRoot(main);
    mkdirSync(slotsRoot(main), { recursive: true });
    if (target.state === 'cold') run(main, 'worktree', 'add', '--detach', target.dir, baseSha);
    else run(target.dir, 'checkout', '-q', '--detach', baseSha);
    if (branch) run(target.dir, 'switch', '-q', '-c', branch, baseSha);
    let worker = null;
    try { worker = identity(target.dir).id; } catch { /* no identity: the lease records none */ }
    const record = { branch: branch ?? null, claimedAt: new Date().toISOString(), base: baseSha, session: session ?? null, worker };
    writeLease(main, target.slot, record);
    return { slot: target.slot, path: target.dir, ...record };
  });
}

// Work in a slot that exists nowhere else: uncommitted changes, or commits neither in the base nor on any remote branch.
export function unsaved(dir, baseSha) {
  const dirty = run(dir, 'status', '--porcelain').split('\n').filter(Boolean);
  const unpushed = run(dir, 'rev-list', 'HEAD', '--not', baseSha, '--remotes').split('\n').filter(Boolean);
  return { dirty, unpushed };
}

// Writes what would be lost to <main>/.go-getter/pool/backup/<slot>-<stamp>/: every changed or untracked file at its path, a patch of
// the tracked changes, and a bundle of the unpushed commits. Returns the directory.
export function backup(main, slot, dir, baseSha, { dirty, unpushed }) {
  const out = path.join(backupDir(main), `${slot}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(path.join(out, 'files'), { recursive: true });
  for (const line of dirty) {
    const file = line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop();
    const from = path.join(dir, file);
    if (existsSync(from)) cpSync(from, path.join(out, 'files', file), { recursive: true });
  }
  const patch = tryRun(dir, 'diff', '--binary', 'HEAD');
  if (patch) writeFileSync(path.join(out, 'work.patch'), `${patch}\n`);
  if (unpushed.length) run(dir, 'bundle', 'create', path.join(out, 'commits.bundle'), 'HEAD', '--not', baseSha);
  return out;
}

// Frees a claimed slot: refuses unsaved or unique work unless forced; `backup` archives it first (and implies force).
export function release(cwd, target, { force = false, backup: doBackup = false } = {}) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  const slot = path.basename(target);
  if (!/^pool-\d+$/.test(slot)) throw new Error(`"${target}" is not a pool slot`);
  return withLock(main, () => {
    const lease = readLease(main, slot);
    if (!lease) throw new Error(`${slot} holds no lease`);
    const dir = slotDir(main, slot);
    const ref = baseRef(main, config);
    const baseSha = run(main, 'rev-parse', `${ref}^{commit}`);
    const found = existsSync(dir) ? unsaved(dir, lease.base ?? baseSha) : { dirty: [], unpushed: [] };
    const lost = found.dirty.length + found.unpushed.length > 0;
    let saved = null;
    if (lost && !force && !doBackup) throw new Error(`${slot} holds work that exists nowhere else (${found.dirty.length} changed files, ${found.unpushed.length} unpushed commits); commit and push it, or use --backup or --force`);
    if (lost && doBackup) saved = backup(main, slot, dir, lease.base ?? baseSha, found);
    if (existsSync(dir)) {
      run(dir, 'reset', '-q', '--hard');
      run(dir, 'clean', '-qfd');
      run(dir, 'checkout', '-q', '--detach', baseSha);
    }
    if (lease.branch) tryRun(main, 'branch', '-D', lease.branch);
    dropLease(main, slot);
    return { slot, path: dir, branch: lease.branch ?? null, backup: saved };
  });
}
