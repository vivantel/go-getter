// State checks for the gated commands whose danger depends on the repository's state (decision 0159, roadmap G1).
// `stateCheck(id, segment, cwd)` answers `{ safe: true }` when the command cannot lose work that exists nowhere else, else
// `{ safe: false, why }`. Anything it cannot read is unsafe: the gate then stops, as it did before the check existed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv, defaultBranch } from './git-env.mjs';

export const STATEFUL = ['git-branch-delete', 'git-reset-hard', 'git-rebase', 'git-worktree-remove'];

const unquote = (w) => w.replace(/^(["'])(.*)\1$/, '$2');
const words = (segment) => segment.trim().split(/\s+/).filter(Boolean).map(unquote);

// `git [-C dir] [--opt]... <sub> args`: the directory and the words after the subcommand, or null when the shape is not plain.
function parseGit(segment, cwd) {
  const w = words(segment);
  if (w[0] !== 'git') return null;
  let dir = cwd;
  let i = 1;
  for (; i < w.length && w[i].startsWith('-'); i++) {
    if (w[i] === '-C') dir = path.resolve(dir, w[++i] ?? '');
    else if (w[i] === '-c') i++;
  }
  return { dir, sub: w[i], rest: w.slice(i + 1) };
}

const bad = (why) => ({ safe: false, why });
const ok = { safe: true };

// Runs a program for its trimmed stdout, or null when it fails; `run` is replaceable so tests need no network.
export const defaultRun = (cmd, args, dir) => {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
};

function branchDelete({ dir, rest }, run) {
  const names = rest.filter((a) => !a.startsWith('-'));
  if (!names.length) return bad('no branch named');
  const trunk = defaultBranch(dir);
  for (const name of names) {
    const tip = run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${name}^{commit}`], dir);
    if (!tip) continue; // no such branch: git refuses, nothing is lost
    const remotes = run('git', ['branch', '-r', '--contains', tip], dir);
    if (remotes) continue; // the commits are on a remote branch
    if (trunk.known && run('git', ['merge-base', '--is-ancestor', tip, `origin/${trunk.name}`], dir) !== null) continue;
    const merged = run('gh', ['pr', 'list', '--head', name, '--state', 'merged', '--json', 'headRefOid', '--jq', '.[].headRefOid'], dir);
    if (merged?.split(/\s+/).includes(tip)) continue; // squash-merged: the tip is not an ancestor, but the PR recorded it
    return bad(`branch ${name} has commits that are on no remote branch, not on ${trunk.known ? `origin/${trunk.name}` : 'the default branch'} and not in a merged pull request`);
  }
  return ok;
}

function resetHard({ dir }, run) {
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], dir);
  if (dirty === null) return bad('cannot read the working tree');
  return dirty ? bad('the working tree has uncommitted changes that reset --hard would discard') : ok;
}

function rebase({ dir, rest }, run) {
  if (rest.some((a) => ['--abort', '--continue', '--skip', '--quit'].includes(a))) return ok; // ends or resumes a rebase already started
  const positional = rest.filter((a) => !a.startsWith('-'));
  const branch = positional.length > 1 ? positional[1] : run('git', ['branch', '--show-current'], dir);
  if (!branch) return bad('cannot tell which branch is rebased');
  const published = run('git', ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`], dir);
  const upstream = run('git', ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], dir);
  return published || upstream ? bad(`branch ${branch} is published, so a rebase rewrites commits others may have`) : ok;
}

function worktreeRemove({ dir, rest }, run) {
  const targets = rest.slice(rest[0] === 'remove' ? 1 : 0).filter((a) => !a.startsWith('-'));
  if (!targets.length) return bad('no worktree named');
  for (const t of targets) {
    const abs = path.resolve(dir, t);
    if (!existsSync(abs)) continue;
    const dirty = run('git', ['status', '--porcelain'], abs);
    if (dirty === null) return bad(`cannot read the worktree ${t}`);
    if (dirty) return bad(`the worktree ${t} has uncommitted or untracked files`);
    // A branch keeps its commits when its worktree goes; a detached HEAD that no branch, remote branch or tag holds does not.
    if (run('git', ['branch', '--show-current'], abs) === '' && !run('git', ['for-each-ref', '--contains', 'HEAD', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags'], abs)) {
      return bad(`the worktree ${t} is on a detached HEAD whose commits no branch or tag holds`);
    }
  }
  return ok;
}

const CHECKS = { 'git-branch-delete': branchDelete, 'git-reset-hard': resetHard, 'git-rebase': rebase, 'git-worktree-remove': worktreeRemove };

export function stateCheck(id, segment, cwd, run = defaultRun) {
  const parsed = parseGit(segment, cwd);
  if (!parsed || !CHECKS[id]) return bad('the command is not a plain git call');
  try {
    return CHECKS[id](parsed, run);
  } catch (err) {
    return bad(`state could not be read (${err.message})`);
  }
}
