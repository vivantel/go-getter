// The one lock around every mutation of worktrees and pool slots (decision draft-wp-pool-is-a-mode-of-worktree-new). `mkdir` is atomic;
// the owner (pid plus the process's start stamp) is written inside, so a holder that died is taken over at once instead of waited out.
// A lock with no readable owner (a holder from before owners were written, or one caught between mkdir and the write) falls back to
// the age rule: older than STALE_MS belongs to a process that died. The start stamp (Linux /proc) tells a reused pid from the holder.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';

const STALE_MS = 60000;

// The Linux start time of a process in clock ticks, null where /proc is not available.
export function startStamp(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// true when the recorded owner is gone (dead pid, or a pid now belonging to another process).
function ownerDead(lock) {
  let owner;
  try {
    owner = JSON.parse(readFileSync(path.join(lock, 'owner'), 'utf8'));
  } catch {
    return null; // unknown: the caller applies the age rule
  }
  if (!alive(owner.pid)) return true;
  return owner.start != null && startStamp(owner.pid) !== owner.start;
}

export function lockPath(main) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: main, encoding: 'utf8', env: cleanGitEnv(process.env) }).trim();
  return path.resolve(main, common, 'go-getter-worktree.lock');
}

// Removes a lock judged dead. The rename is atomic, so of several contenders one wins; the winner checks what it moved, because a
// contender that judged the same dead lock may have replaced it with a live one in between, which is then put back.
function takeOver(lock) {
  const tomb = `${lock}.dead-${process.pid}-${Date.now()}`;
  renameSync(lock, tomb);
  if (ownerDead(tomb) === false) {
    try { renameSync(tomb, lock); return; } catch { /* a third lock took its place: the live holder's work is unguarded; nothing safe is left to do */ }
  }
  rmSync(tomb, { recursive: true, force: true });
}

export function withLock(main, fn, { waitMs = 15000, label = 'go-getter worktree new' } = {}) {
  const lock = lockPath(main);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock);
      try {
        writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: process.pid, start: startStamp(process.pid) }));
      } catch { /* released at once by a racing takeover; the finally below tolerates it */ }
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const dead = ownerDead(lock);
        if (dead === true || (dead === null && Date.now() - statSync(lock).mtimeMs > STALE_MS)) takeOver(lock);
      } catch { /* released or removed by another process */ }
      if (Date.now() > deadline) throw new Error(`another "${label}" holds the lock`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
