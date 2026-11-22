// Worktrees of the repository that are not pool slots, and the verbs that take them in or remove them: `outside` for `status`, `adopt`
// (a worktree becomes a claimed slot, or goes when its work is merged) and `remove` (the verb that replaces raw `git worktree remove`,
// with the refusal rules of `release`).
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { clockNow, identity } from '../work/ops.mjs';
import { listWorktrees } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { withLock } from './lock.mjs';
import { readLease, writeLease } from './lease.mjs';
import { squashMerged } from './merged.mjs';
import { backup, unsaved } from './slots.mjs';
import { baseRef, poolStatus, slotDir, slotsRoot } from './state.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
const isSlotPath = (main, p) => real(path.dirname(p)) === real(slotsRoot(main)) && /^pool-\d+$/.test(path.basename(p));

// Is everything on `dir`'s HEAD already in the base (by ancestry, or as a squash)?
function mergedInto(main, dir, branch, target) {
  if (tryGit(dir, 'rev-list', '--count', 'HEAD', '--not', target) === '0') return true;
  return Boolean(branch) && squashMerged(main, branch, target);
}

// Every worktree of the repository that is neither the main checkout nor a pool slot.
export function outside(cwd) {
  const main = listWorktrees(cwd)[0].path;
  const config = poolConfig(main);
  const target = baseRef(main, config);
  return listWorktrees(main).slice(1).filter((t) => !isSlotPath(main, t.path)).map((t) => {
    if (!existsSync(t.path)) return { path: t.path, branch: t.branch, missing: true };
    const dirty = git(t.path, 'status', '--porcelain', '-uall').split('\n').filter(Boolean).length;
    const ct = Number(tryGit(t.path, 'log', '-1', '--format=%ct') ?? 0);
    return { path: t.path, branch: t.branch, dirty, lastCommitAgeSeconds: ct ? Math.round(clockNow().getTime() / 1000 - ct) : null, merged: mergedInto(main, t.path, t.branch, target) };
  });
}

// Removes a worktree outside the pool. Refuses unsaved or unique work unless forced; `backup` archives it first (and implies force).
export function remove(cwd, target, { force = false, backup: doBackup = false } = {}) {
  const main = listWorktrees(cwd)[0].path;
  const dir = real(path.resolve(cwd, target));
  const tree = listWorktrees(main).find((t) => real(t.path) === dir);
  if (!tree) throw new Error(`"${target}" is not a worktree of this repository`);
  if (tree.main) throw new Error('refusing to remove the main checkout');
  if (isSlotPath(main, tree.path)) throw new Error(`${path.basename(dir)} is a pool slot; use "go-getter pool release ${path.basename(dir)}"`);
  const config = poolConfig(main);
  return withLock(main, () => {
    const baseSha = git(main, 'rev-parse', `${baseRef(main, config)}^{commit}`);
    const found = existsSync(dir) ? unsaved(dir, baseSha) : { dirty: [], unpushed: [] };
    const lost = found.dirty.length + found.unpushed.length > 0;
    if (lost && !force && !doBackup) throw new Error(`${dir} holds work that exists nowhere else (${found.dirty.length} changed files, ${found.unpushed.length} unpushed commits); commit and push it, or use --backup or --force`);
    const saved = lost && doBackup ? backup(main, path.basename(dir), dir, baseSha, found) : null;
    git(main, 'worktree', 'remove', '--force', dir);
    if (tree.branch) tryGit(main, 'branch', '-d', tree.branch);
    return { path: dir, branch: tree.branch, backup: saved };
  });
}

// Takes a worktree of the repository into the pool. A pool slot with no lease gets one; a worktree elsewhere moves into a cold slot.
// A worktree whose work is all in the base is not worth a slot: it is freed (a slot) or removed (elsewhere). A detached worktree with
// commits needs `branch` to name them.
export function adopt(cwd, target, { branch } = {}) {
  const main = listWorktrees(cwd)[0].path;
  const config = poolConfig(main);
  const dir = real(/^pool-\d+$/.test(target) ? slotDir(main, target) : path.resolve(cwd, target));
  const tree = listWorktrees(main).find((t) => real(t.path) === dir);
  if (!tree || tree.main) throw new Error(`"${target}" is not an adoptable worktree of this repository`);
  return withLock(main, () => {
    const targetRef = baseRef(main, config);
    const baseSha = git(main, 'rev-parse', `${targetRef}^{commit}`);
    const name = tree.branch ?? branch ?? null;
    const done = mergedInto(main, dir, tree.branch, targetRef);
    const found = unsaved(dir, baseSha);
    if (done && !found.dirty.length) {
      if (isSlotPath(main, dir)) {
        git(dir, 'checkout', '-q', '--detach', baseSha);
        git(dir, 'clean', '-qfd');
        if (tree.branch) tryGit(main, 'branch', '-D', tree.branch);
        return { action: 'freed', slot: path.basename(dir) };
      }
      git(main, 'worktree', 'remove', '--force', dir);
      if (tree.branch) tryGit(main, 'branch', '-d', tree.branch);
      return { action: 'removed', path: dir, reason: 'its work is in the base' };
    }
    if (!name) throw new Error(`${dir} is detached with work of its own; give it a name with --branch <name>`);
    if (!new RegExp(config.branchPattern).test(name)) throw new Error(`branch "${name}" does not match the pool's branch pattern ${config.branchPattern}`);
    let slot;
    let slotPath;
    if (isSlotPath(main, dir)) {
      slot = path.basename(dir);
      slotPath = dir;
      if (readLease(main, slot)) throw new Error(`${slot} already holds a lease`);
    } else {
      const cold = poolStatus(main).slots.find((s) => s.state === 'cold');
      if (!cold) throw new Error('the pool has no cold slot to move this worktree into; release one first');
      git(main, 'worktree', 'move', dir, cold.dir);
      slot = cold.slot;
      slotPath = cold.dir;
    }
    if (!tree.branch) git(slotPath, 'switch', '-q', '-c', name);
    let worker = null;
    let workerKind = null;
    try { ({ id: worker, kind: workerKind } = identity(slotPath)); } catch { /* no identity */ }
    const claimedAt = clockNow().toISOString();
    const record = { branch: name, claimedAt, heartbeatAt: claimedAt, base: git(slotPath, 'merge-base', 'HEAD', baseSha), session: null, worker, workerKind };
    writeLease(main, slot, record);
    return { action: 'adopted', slot, path: slotPath, branch: name };
  });
}
