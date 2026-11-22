// Is a claimed slot's work finished? Shared by `worktree clean` (squashMerged, prMerged: unchanged behaviour) and `pool reap`
// (decide). Work is never freed on a guess: a pull request closed without merging keeps its slot (`closed-unmerged`), and an open one
// keeps it too.
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../git-env.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tryGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};

// A squash merge leaves the branch tip outside the target's history, so ancestry misses it. Collapse the branch into one
// commit on its merge base and ask `git cherry` whether the target already holds an equivalent patch.
export function squashMerged(main, branch, target) {
  const base = tryGit(main, 'merge-base', target, branch);
  if (!base) return false;
  const synthetic = tryGit(main, '-c', 'user.name=go-getter', '-c', 'user.email=go-getter@localhost', 'commit-tree', `${branch}^{tree}`, '-p', base, '-m', 'squash');
  return synthetic !== null && (tryGit(main, 'cherry', target, synthetic) ?? '').startsWith('-');
}

// The branch's pull request was merged with this very tip: a squash merge whose patch `git cherry` cannot match (an edited
// squash, a resolved conflict) and whose remote branch is still there. Needs `gh`; false when it cannot be asked.
export function prMerged(main, branch) {
  try {
    const tip = git(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`);
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'headRefOid', '--jq', '.[].headRefOid'], { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, env: cleanGitEnv(process.env) });
    return out.split(/\s+/).includes(tip);
  } catch {
    return false;
  }
}

// Every pull request with this head, any state: [{number, state, headRefOid, mergedAt}], or null when `gh` cannot be asked.
export function pullRequests(main, branch) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,headRefOid,mergedAt'], { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, env: cleanGitEnv(process.env) });
    return JSON.parse(out || '[]');
  } catch {
    return null;
  }
}

// Decides one claimed slot. `lease` is its lease, `dir` its worktree, `target` the base ref, `now` a Date.
// Returns { merged: true, reason } or { merged: false, keep: 'open-pr' | 'closed-unmerged' | 'not-merged' | 'session' | 'young' | 'idle', reason }.
export function decide(main, { lease, dir, target, now, graceSeconds, ttlSeconds, prs = pullRequests }) {
  const age = (now - new Date(lease.claimedAt)) / 1000;
  const branch = lease.branch;
  if (!branch) return { merged: false, keep: 'session', reason: 'unnamed session slot' };
  if (!(age >= graceSeconds)) return { merged: false, keep: 'young', reason: `claimed less than ${graceSeconds}s ago` };
  const tip = tryGit(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`);
  const gone = tryGit(main, 'for-each-ref', '--format=%(upstream:track)', `refs/heads/${branch}`) === '[gone]';
  const list = prs(main, branch) ?? [];
  const open = list.find((p) => p.state === 'OPEN');
  if (open) return { merged: false, keep: 'open-pr', reason: `pull request #${open.number} is open` };
  if (list.some((p) => p.state === 'MERGED' && tip && p.headRefOid === tip)) return { merged: true, reason: 'pull request merged' };
  const closed = list.find((p) => p.state === 'CLOSED' && !p.mergedAt);

  if (!tip) {
    // The branch ref is gone: the slot's own HEAD decides.
    const unique = tryGit(dir, 'rev-list', '--count', 'HEAD', '--not', target);
    if (unique === '0') return { merged: true, reason: 'branch ref gone and its commits are in the base' };
    if (tryGit(dir, 'cherry', target, 'HEAD')?.split('\n').filter(Boolean).every((l) => l.startsWith('-'))) return { merged: true, reason: 'branch ref gone and its patches are in the base' };
    return { merged: false, keep: closed ? 'closed-unmerged' : 'not-merged', reason: 'branch ref gone and its commits are not in the base' };
  }
  const moved = tip !== lease.base;
  if (moved) {
    if (tryGit(main, 'merge-base', '--is-ancestor', tip, target) !== null) return { merged: true, reason: `ancestor of ${target}` };
    if (squashMerged(main, branch, target)) return { merged: true, reason: closed ? `closed pull request #${closed.number}; its patch is in ${target}` : `patch-equivalent to ${target} (squash)` };
    if (closed) return { merged: false, keep: 'closed-unmerged', reason: `pull request #${closed.number} was closed without merging` };
    if (gone) return { merged: true, reason: 'remote branch deleted' };
    return { merged: false, keep: 'not-merged', reason: `not merged into ${target}` };
  }
  // Still at its creation commit: nothing to merge; idle slots are reclaimed only after the session TTL.
  if (age >= ttlSeconds) return { merged: true, reason: 'no work since the claim, past the session ttl' };
  return { merged: false, keep: 'idle', reason: 'no work yet; kept until the session ttl' };
}
