// Pool slots: `<main>-wt/pool-NN` (the sibling location of decision 0041). A slot is cold (no directory), free (detached on the base,
// clean, no lease), claimed (a lease) or unmanaged (anything else, with a reason). WP3 refines the free test and the reasons.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { clockNow, identity } from '../work/ops.mjs';
import { fetchOrigin } from '../worktree.mjs';
import { withLock } from './lock.mjs';
import { backupDir, dropLease, ensurePoolRoot, readLease, writeLease } from './lease.mjs';
import { baseRef, mainCheckout, poolStatus, slotDir, slotsRoot } from './state.mjs';
import { poolConfig } from './config.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
// Untrimmed: `status --porcelain` lines start with a space that trimming would eat, shifting every path by one.
const runRaw = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) });
const tryRun = (cwd, ...args) => { try { return run(cwd, ...args); } catch { return null; } };
export { slotName, slotsRoot, slotDir, mainCheckout, baseRef, poolStatus } from './state.mjs';

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
    let workerKind = null;
    try { ({ id: worker, kind: workerKind } = identity(target.dir)); } catch { /* no identity: the lease records none */ }
    const claimedAt = clockNow().toISOString();
    const record = { branch: branch ?? null, claimedAt, heartbeatAt: claimedAt, base: baseSha, session: session ?? null, worker, workerKind };
    writeLease(main, target.slot, record);
    return { slot: target.slot, path: target.dir, ...record };
  });
}

// Work in a slot that exists nowhere else: uncommitted changes, or commits neither in the base nor on any remote branch.
export function unsaved(dir, baseSha) {
  const dirty = runRaw(dir, 'status', '--porcelain', '-uall').split('\n').filter(Boolean);
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

// Frees a slot whose work is saved or finished: detaches it at the base, deletes its branch and drops the lease. No lock here: callers hold it.
export function free(main, slot, lease, baseSha) {
  const dir = slotDir(main, slot);
  if (existsSync(dir)) {
    run(dir, 'reset', '-q', '--hard');
    run(dir, 'clean', '-qfd');
    run(dir, 'checkout', '-q', '--detach', baseSha);
  }
  if (lease.branch) tryRun(main, 'branch', '-D', lease.branch);
  dropLease(main, slot);
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
    free(main, slot, lease, baseSha);
    return { slot, path: dir, branch: lease.branch ?? null, backup: saved };
  });
}
