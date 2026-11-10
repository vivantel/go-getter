// `go-getter worktree new|list|clean` (plan 5.2): parallel-task isolation as chosen in the orchestration pack's
// isolation, location and concurrency decisions (decision 0028). Defaults to the recommended answers when the pack is not adopted.
import { cleanGitEnv, defaultBranch as remoteDefaultBranch } from './git-env.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readArtifacts } from './artifacts.mjs';

// A stray GIT_DIR or GIT_WORK_TREE (set by a git hook) must not redirect a removal to another repository.
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tryGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};

// Brings origin's branches up to date (and drops the ones deleted there) so a new branch starts from the current default
// branch and `clean` sees merged branches as gone. 'none' without an origin; 'failed' offline: the caller carries on with what is known.
export function fetchOrigin(main) {
  if (tryGit(main, 'remote', 'get-url', 'origin') === null) return 'none';
  try {
    execFileSync('git', ['fetch', '-q', '--prune', 'origin'], { cwd: main, stdio: 'ignore', timeout: 30000, env: cleanGitEnv(process.env) });
    return 'ok';
  } catch {
    console.error('worktree: could not fetch origin; using what is known');
    return 'failed';
  }
}

// Serialises the check-then-create of `worktree new` across processes: agents started together would otherwise all pass the
// concurrency check. `mkdir` is atomic; a lock older than STALE_MS belongs to a process that died.
const STALE_MS = 60000;
function withLock(main, fn) {
  const lock = path.resolve(main, tryGit(main, 'rev-parse', '--git-common-dir'), 'go-getter-worktree.lock');
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmdirSync(lock);
      } catch { /* released or removed by another process */ }
      if (Date.now() > deadline) throw new Error('another "go-getter worktree new" holds the lock');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    rmdirSync(lock, { recursive: false });
  }
}

export function worktreeConfig(project) {
  const data = Object.assign(
    {},
    ...readArtifacts(project, ['decisions'])
      .filter((d) => d.data.status === 'active' && String(d.data['go-getter']?.['generated-by'] ?? '').startsWith('orchestration@'))
      .map((d) => d.data['go-getter']),
  );
  return { isolation: data.isolation ?? 'worktree', location: data['worktree-location'] ?? 'sibling', max: Number(data['max-concurrent'] ?? 3), maxAnswered: data['max-concurrent'] != null };
}

// [{path, branch|null, head, main, prunable}] from `git worktree list --porcelain`; the first entry is the main working tree.
export function listWorktrees(cwd) {
  return git(cwd, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .filter(Boolean)
    .map((block, i) => {
      const field = (name) => new RegExp(`^${name} (.*)$`, 'm').exec(block)?.[1] ?? null;
      return { path: field('worktree'), branch: field('branch')?.replace(/^refs\/heads\//, '') ?? null, head: field('HEAD'), main: i === 0, prunable: /^prunable\b/m.test(block) };
    });
}

function defaultBranch(main) {
  const remote = remoteDefaultBranch(main);
  if (remote.known) return `origin/${remote.name}`;
  return ['main', 'master'].find((b) => tryGit(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) ?? 'HEAD';
}

// The directory holding a project's worktrees under the chosen location, or null when the host agent decides.
export function worktreeRoot(main, location) {
  if (location === 'sibling') return path.join(path.dirname(main), `${path.basename(main)}-wt`);
  if (location === 'in-repo') return path.join(main, '.worktrees');
  return null;
}

// Where a task's worktree goes under the chosen location, or null when the host agent decides.
export function worktreeDir(main, location, slug) {
  const root = worktreeRoot(main, location);
  return root && path.join(root, slug);
}

// Marks the refusal at the concurrency limit, so a caller can clean and retry once.
export const WORKTREE_LIMIT = 'WORKTREE_LIMIT';

export function newWorktree(cwd, slug, { branch, from } = {}) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug ?? '')) throw new Error('slug must be lowercase words joined by hyphens');
  const main = listWorktrees(cwd)[0].path;
  if (!from) fetchOrigin(main);
  return withLock(main, () => {
    const trees = listWorktrees(cwd);
    const config = worktreeConfig(main);
    if (config.isolation !== 'worktree') throw new Error(`isolation is "${config.isolation}"; this project does not use worktrees`);
    if (config.location === 'host-default') throw new Error('worktree location is the host default; let the host agent create the worktree');
    const dir = worktreeDir(main, config.location, slug);
    const name = branch ?? `feat/${slug}`;
    // A resumed task: its slug's directory already holds a worktree on this branch. Hand that one back; it is not a new
    // worktree, so the limit does not apply.
    if (trees.some((t) => !t.main && t.path === dir && t.branch === name)) return { path: dir, branch: name, existing: true };
    if (trees.length - 1 >= config.max) throw Object.assign(new Error(`${trees.length - 1} worktrees already exist; the limit is ${config.max} concurrent agents (run "go-getter worktree clean" or finish a task)`), { code: WORKTREE_LIMIT });
    if (existsSync(dir)) throw new Error(`${dir} already exists`);
    git(main, 'worktree', 'add', '-b', name, dir, from ?? defaultBranch(main));
    return { path: dir, branch: name };
  });
}

// A squash merge leaves the branch tip outside the target's history, so ancestry misses it. Collapse the branch into one
// commit on its merge base and ask `git cherry` whether the target already holds an equivalent patch.
function squashMerged(main, branch, target) {
  const base = tryGit(main, 'merge-base', target, branch);
  if (!base) return false;
  const synthetic = tryGit(main, '-c', 'user.name=go-getter', '-c', 'user.email=go-getter@localhost', 'commit-tree', `${branch}^{tree}`, '-p', base, '-m', 'squash');
  return synthetic !== null && (tryGit(main, 'cherry', target, synthetic) ?? '').startsWith('-');
}

// The branch's pull request was merged with this very tip: a squash merge whose patch `git cherry` cannot match (an edited
// squash, a resolved conflict) and whose remote branch is still there. Needs `gh`; false when it cannot be asked.
function prMerged(main, branch) {
  try {
    const tip = git(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`);
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'headRefOid', '--jq', '.[].headRefOid'], { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, env: cleanGitEnv(process.env) });
    return out.split(/\s+/).includes(tip);
  } catch {
    return false;
  }
}

// Linked worktrees in the managed location, with what `clean` would do about each.
// `only` plans just that worktree path, so a broken sibling is never inspected.
export function planClean(cwd, { only } = {}) {
  const trees = listWorktrees(cwd);
  const main = trees[0].path;
  fetchOrigin(main);
  const config = worktreeConfig(main);
  const base = worktreeRoot(main, config.location) ?? worktreeRoot(main, 'sibling');
  const target = defaultBranch(main);
  const here = tryGit(cwd, 'rev-parse', '--show-toplevel');
  return trees
    .filter((t) => !t.main && t.path.startsWith(`${base}${path.sep}`) && (!only || t.path === only))
    .map((t) => {
      try {
        return planOne(t);
      } catch (err) {
        // A worktree git cannot read (its directory deleted by hand, say) is kept, never fatal to the rest.
        return { ...t, action: 'keep', reason: `unreadable: ${String(err.message).trim().split('\n')[0]}` };
      }
    });
  function planOne(t) {
    if (!t.branch) return { ...t, action: 'keep', reason: 'detached HEAD' };
    if (t.path === here) return { ...t, action: 'keep', reason: 'current worktree' };
    if (git(t.path, 'status', '--porcelain')) return { ...t, action: 'keep', reason: 'uncommitted changes' };
    const gone = tryGit(main, 'for-each-ref', '--format=%(upstream:track)', `refs/heads/${t.branch}`) === '[gone]';
    // `worktree add -b` leaves one reflog entry; any commit adds another. A branch with no commits of its own is a task just started, not a merged one.
    const hasWork = (tryGit(main, 'reflog', 'show', '--format=%H', `refs/heads/${t.branch}`) ?? '').split('\n').filter(Boolean).length > 1;
    const behind = hasWork && tryGit(main, 'merge-base', '--is-ancestor', t.branch, target) !== null;
    const squashed = hasWork && !behind && squashMerged(main, t.branch, target);
    const viaPr = hasWork && !gone && !behind && !squashed && prMerged(main, t.branch);
    if (gone || behind || squashed || viaPr) return { ...t, action: 'remove', reason: gone ? 'remote branch deleted' : viaPr ? 'pull request merged' : `${squashed ? 'squash-merged' : 'merged'} into ${target}` };
    return { ...t, action: 'keep', reason: `not merged into ${target}` };
  }
}

// `keepBranch` leaves the local branches alone. `only` limits the removal to one worktree path; the others keep their planned action but are left alone.
export function cleanWorktrees(cwd, { dryRun = false, only, keepBranch = false } = {}) {
  const main = listWorktrees(cwd)[0].path;
  // Registrations whose directory was deleted by hand would otherwise make git fail on them.
  if (!dryRun) tryGit(main, 'worktree', 'prune');
  const plan = planClean(cwd, { only });
  for (const t of plan) {
    if (t.action !== 'remove' || dryRun) continue;
    try {
      git(main, 'worktree', 'remove', t.path);
    } catch (err) {
      // Already removed by a parallel start, or locked: skip it and go on.
      t.action = 'keep';
      t.reason = `removal failed: ${String(err.stderr || err.message).trim().split('\n')[0]}`;
      continue;
    }
    t.removed = true;
    if (keepBranch) continue;
    // Squash-merged branches are not ancestors of the target, so -d refuses; keep such a branch rather than force-delete it.
    t.branchDeleted = tryGit(main, 'branch', '-d', t.branch) !== null;
  }
  if (!dryRun) tryGit(main, 'worktree', 'prune');
  return plan;
}

// After a merge: removes the linked worktree `cwd` is in, by the safe criteria of `cleanWorktrees` (remote branch gone or
// merged, no uncommitted changes), from the main checkout. The local branch stays. { main, released, reason } or null when
// `cwd` is not a linked worktree.
export function releaseWorktree(cwd) {
  const trees = listWorktrees(cwd);
  const main = trees[0].path;
  const top = tryGit(cwd, 'rev-parse', '--show-toplevel');
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  const self = top && trees.find((t) => !t.main && real(t.path) === real(top));
  if (!self) return null;
  // Plan from the main checkout, where the worktree is not "current" and can be removed.
  const item = cleanWorktrees(main, { only: self.path, keepBranch: true }).find((t) => t.path === self.path);
  const released = item?.removed === true;
  return { main, path: self.path, branch: self.branch, released, reason: item ? item.reason : 'outside the managed location' };
}
