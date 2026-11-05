// What lets another worker pick up a unit whose holder is gone (decision 0173 items 2 and 6): the per-unit checkpoint ref pushed with
// every heartbeat and release, the point a new claimant resumes from, and the check of a claim's pinned brief version.
// Plain git, no force: each checkpoint is a child of the one before, so the push is a fast-forward.
import { CHECKPOINT_REF, snapshotCommit } from '../checkpoint.mjs';
import { findings } from '../secrets/patterns.mjs';
import { CACHE, fetchRef, git, pushRef } from './ledger.mjs';

export const unitCheckpointRef = (unit) => `${CHECKPOINT_REF}/${unit}`;
// The local copy of a unit's pushed checkpoint lives in the cache namespace, never among the local `checkpoints/` refs (those are pruned to 10).
const cacheRef = (unit) => `${CACHE}/unit-checkpoint/${unit}`;
const NET = { allowFail: true, timeout: 20_000 };

const currentBranch = (root) => git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFail: true }) || null;

// Pushes a checkpoint of the working tree to `refs/go-getter/checkpoints/<unit>` of `remote`, a child of the one already there. Nothing is
// pushed with no remote (nobody else could read it), outside a repository, or when the changes since HEAD hold a secret (the checkpoint
// would publish it). { ok, commit } | { skipped: reason } | { offline }.
export function pushUnitCheckpoint(root, remote, unit) {
  if (!remote) return { skipped: 'no remote' };
  const ref = unitCheckpointRef(unit);
  for (let attempt = 0; attempt < 2; attempt++) {
    const seen = fetchRef(root, remote, ref, cacheRef(unit));
    if (!seen.online) return { offline: true };
    const branch = currentBranch(root);
    const head = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true }) || '';
    const snap = snapshotCommit(root, { parents: seen.tip ? [seen.tip] : [], message: `go-getter unit checkpoint ${unit}\nbranch ${branch ?? ''}\nhead ${head}` });
    if (!snap) return { skipped: 'not a repository' };
    const added = git(root, ['diff', '--no-color', '--unified=0', head || git(root, ['hash-object', '-t', 'tree', '/dev/null']), snap.tree], { allowFail: true }) ?? '';
    if (findings(added.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n')).length) return { skipped: 'the working tree holds a secret' };
    const pushed = pushRef(root, remote, ref, snap.commit, seen.tip);
    if (pushed.ok) {
      git(root, ['update-ref', cacheRef(unit), snap.commit], { allowFail: true });
      return { ok: true, commit: snap.commit };
    }
    if (pushed.offline) return { offline: true };
  }
  return { offline: true };
}

// Where a new claimant of `unit` resumes: { checkpoint: { commit, tree }, branch: { name, commit } } from the pushed checkpoint ref and
// the unit branch it names, or null when nothing was pushed or the remote cannot be reached.
export function resumePoint(root, remote, unit) {
  if (!remote) return null;
  const seen = fetchRef(root, remote, unitCheckpointRef(unit), cacheRef(unit));
  if (!seen.online || !seen.tip) return null;
  const message = git(root, ['log', '-1', '--format=%B', seen.tip], { allowFail: true }) ?? '';
  const name = /^branch (.+)$/m.exec(message)?.[1]?.trim() || null;
  let tip = null;
  if (name) {
    const ls = git(root, ['ls-remote', remote, `refs/heads/${name}`], NET);
    tip = ls?.split('\t')[0] || null;
  }
  return { checkpoint: { commit: seen.tip, tree: git(root, ['rev-parse', `${seen.tip}^{tree}`]) }, branch: { name, commit: tip } };
}

// Puts this worktree where the previous holder left off: the pushed unit branch is fetched and checked out, then the files the checkpoint
// holds are laid over it (so uncommitted work comes back). Refuses a worktree with uncommitted changes to tracked files. { ok, branch } | { ok: false, error }.
export function resumeInto(root, remote, point) {
  if (!point?.checkpoint) return { ok: false, error: 'nothing to resume from' };
  if (git(root, ['status', '--porcelain', '--untracked-files=no'], { allowFail: true })) return { ok: false, error: 'the worktree has uncommitted changes to tracked files; resume into a clean one' };
  const { name, commit } = point.branch ?? {};
  if (name && commit) {
    if (git(root, ['fetch', '--no-tags', '--quiet', remote, `+refs/heads/${name}:refs/remotes/${remote}/${name}`], NET) === null) return { ok: false, error: `could not fetch ${name}` };
    git(root, ['switch', '-C', name, `refs/remotes/${remote}/${name}`]);
  }
  git(root, ['restore', `--source=${point.checkpoint.commit}`, '--worktree', '--', '.']);
  return { ok: true, branch: name ?? null };
}

// A claim pins the brief version it was made under. null while the brief is the same; otherwise what a worker must do (decision 0173 item 6).
export function briefNote(pinned, current) {
  if (!pinned || !current || pinned === current) return null;
  return { pinned, current, action: 're-read the brief (go-getter work rebrief <unit>) or release the unit' };
}
