// State checks for the gated commands whose danger depends on the repository's state (decision 0159, roadmap G1).
// `stateCheck(id, segment, cwd)` answers `{ safe: true }` when the command cannot lose work that exists nowhere else, else
// `{ safe: false, why }`. Anything it cannot read is unsafe: the gate then stops, as it did before the check existed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv, defaultBranch } from './git-env.mjs';

export const STATEFUL = ['git-branch-delete', 'git-reset-hard', 'git-rebase', 'git-worktree-remove'];

// Splits on whitespace outside quotes and drops the quotes, so `-x "echo a b"` is one word.
function words(segment) {
  const out = [];
  let cur = '';
  let quote = null;
  let any = false;
  for (const ch of segment.trim()) {
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

const VALUE_GLOBALS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);

// `[GIT_DIR=x] git [global flags] <sub> args`: the directory, the flags that select the repository (`target`, passed on to
// every git call so the repository judged is the one the command acts on), and the words after the subcommand; null when the shape is not plain.
function parseGit(segment, cwd) {
  const w = words(segment);
  const env = {};
  let i = 0;
  for (; i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i]); i++) env[w[i].slice(0, w[i].indexOf('='))] = w[i].slice(w[i].indexOf('=') + 1);
  if (w[i] !== 'git') return null;
  i++;
  let dir = cwd;
  let gitDir = env.GIT_DIR;
  let workTree = env.GIT_WORK_TREE;
  for (; i < w.length && w[i].startsWith('-'); i++) {
    const [name, inline] = w[i].startsWith('--') && w[i].includes('=') ? [w[i].slice(0, w[i].indexOf('=')), w[i].slice(w[i].indexOf('=') + 1)] : [w[i], undefined];
    const value = () => inline ?? w[++i] ?? '';
    if (name === '-C') dir = path.resolve(dir, value());
    else if (name === '--git-dir') gitDir = value();
    else if (name === '--work-tree') workTree = value();
    else if (VALUE_GLOBALS.has(name)) value();
  }
  const target = [];
  if (gitDir) target.push('--git-dir', path.resolve(dir, gitDir));
  if (workTree) { workTree = path.resolve(dir, workTree); target.push('--work-tree', workTree); dir = workTree; }
  return { dir, target, sub: w[i], rest: w.slice(i + 1) };
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

function resetHard({ dir, rest }, run) {
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], dir);
  if (dirty === null) return bad('cannot read the working tree');
  if (dirty) return bad('the working tree has uncommitted changes that reset --hard would discard');
  // Commits that HEAD holds and neither a remote branch nor the reset target keeps would be lost with the branch pointer.
  const to = rest.find((a) => !a.startsWith('-')) ?? 'HEAD';
  const lost = run('git', ['rev-list', '-n1', 'HEAD', '--not', '--remotes', to], dir);
  if (lost === null) return bad('cannot tell which commits the reset drops');
  return lost ? bad('the reset drops commits that are on no remote branch') : ok;
}

const REBASE_VALUE_OPTIONS = new Set(['--onto', '-s', '--strategy', '-X', '--strategy-option']);

function rebase({ dir, rest }, run) {
  if (rest.some((a) => ['--abort', '--continue', '--skip', '--quit'].includes(a))) return ok; // ends or resumes a rebase already started
  // `--exec` and `-x` (also inside a cluster such as `-ix`) run commands that nothing here can inspect.
  if (rest.some((a) => a === '--exec' || a.startsWith('--exec=') || /^-[a-zA-Z]*x/.test(a))) return bad('--exec runs commands that cannot be inspected');
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (REBASE_VALUE_OPTIONS.has(rest[i])) i++;
    else if (!rest[i].startsWith('-')) positional.push(rest[i]);
  }
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
    const { target } = parsed;
    const aimed = target.length ? (cmd, args, d) => run(cmd, cmd === 'git' ? [...target, ...args] : args, d) : run;
    return CHECKS[id](parsed, aimed);
  } catch (err) {
    return bad(`state could not be read (${err.message})`);
  }
}
