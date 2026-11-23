// The isolation gate of the worktree pool (guardrail work-happens-in-pool-worktrees, opt-in by the pack answer `pool-only`): in the main
// checkout of a pool project an edit, or a shell command that is not read-only, is refused with the verb that gives the agent a slot.
// Inside a slot, outside the repository, and any read are allowed. In pool mode (with or without `pool-only`) raw `git worktree add|remove|prune`
// are refused too: the pool owns the worktrees. Pure decisions over a tool call; the hook wires them (hook.mjs).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { goGetterCommand } from '../invocation.mjs';
import { commandWords, unwrapWords } from '../shell.mjs';
import { listWorktrees } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { slotsRoot } from './state.mjs';

const real = (p) => { try { return realpathSync(p); } catch { return p; } };
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

const READ_PROGRAMS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'printf', 'true', 'false', 'test', '[', 'date', 'which', 'type', 'command', 'stat', 'file', 'du', 'df', 'sort', 'uniq', 'cut', 'tr', 'diff', 'cmp', 'jq', 'sleep', 'basename', 'dirname', 'realpath', 'readlink', 'tree', 'less', 'more', 'ps', 'whoami', 'id', 'uname', 'hostname', 'grep', 'egrep', 'fgrep', 'rg', 'nl', 'column', 'env', 'printenv', 'cd', 'pushd', 'popd', 'sha256sum', 'md5sum', 'seq', 'expr', 'tput']);
const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-remote', 'ls-tree', 'describe', 'blame', 'cat-file', 'merge-base', 'for-each-ref', 'show-ref', 'shortlog', 'grep', 'fetch', 'rev-list', 'name-rev', 'cherry', 'check-ignore', 'count-objects', 'whatchanged', 'help', 'version', 'var', 'diff-tree', 'diff-index', 'diff-files', 'range-diff', 'verify-commit', 'verify-tag']);
const GH_READ = /^(?:pr|issue|run|release|repo|workflow)$/;
const GH_READ_VERB = /^(?:view|list|status|checks|diff|watch)$/;

const WRITE_FILE_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit', 'write_file', 'replace', 'create', 'str_replace_editor', 'delete', 'apply_patch']);
export const isWriteTool = (name) => WRITE_FILE_TOOLS.has(String(name ?? '').toLowerCase());

// Where a read-only judgement of one simple command ends: true when it changes nothing in the checkout it runs in.
function readOnlyWords(words) {
  const eff = unwrapWords(words);
  if (!eff.length) return true;
  const name = path.basename(eff[0]);
  const args = eff.slice(1);
  if (name === 'git') {
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i])) i++;
      else if (!args[i].startsWith('-')) rest.push(args[i]);
    }
    const sub = rest[0];
    if (GIT_READ.has(sub)) return true;
    if (sub === 'branch') return args.every((a) => /^(?:-a|-r|-v|-vv|--list|--all|--remotes|--merged|--no-merged|--contains|--show-current|branch)$/.test(a) || !a.startsWith('-')) && rest.length <= 1 + (args.includes('--contains') || args.includes('--merged') || args.includes('--no-merged') ? 1 : 0);
    if (sub === 'worktree') return rest[1] === 'list';
    if (sub === 'stash') return rest[1] === 'list' || rest[1] === 'show';
    if (sub === 'remote') return !['add', 'remove', 'rm', 'rename', 'set-url', 'set-head', 'prune', 'update'].includes(rest[1]);
    if (sub === 'config') return args.some((a) => /^--(?:get|get-all|list|get-regexp)$|^-l$/.test(a));
    if (sub === 'tag') return rest.length === 1 || args.some((a) => /^(?:-l|--list|--contains|--merged)$/.test(a));
    return false;
  }
  if (name === 'gh') return GH_READ.test(args[0] ?? '') && GH_READ_VERB.test(args[1] ?? '');
  if (name === 'find') return !args.some((a) => /^-(?:delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/.test(a));
  if (name === 'sed') return !args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a));
  if (name === 'env') return args.length === 0;
  return READ_PROGRAMS.has(name);
}

// Whether the text redirects output to a file (not /dev/null, not a descriptor copy).
const redirectsToFile = (command) => /(?:^|[^<>=&|-])\d?>>?(?![&(])\s*(?!\/dev\/null)\S/.test(command.replace(/\d?>&\d/g, ''));

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

// Every simple command of `command`, with `sh -c` and `eval` bodies read too; null when it cannot be read.
function simpleCommands(command, depth = 0) {
  const lists = commandWords(command);
  if (!lists) return null;
  const out = [];
  for (const words of lists) {
    const eff = unwrapWords(words);
    if (!eff.length) continue;
    out.push(eff);
    const name = path.basename(eff[0]);
    const flag = SHELLS.has(name) ? eff.findIndex((x, i) => i > 0 && /^-[A-Za-z]*c$/.test(x)) : -1;
    const body = flag > 0 ? eff[flag + 1] : name === 'eval' ? eff.slice(1).join(' ') : undefined;
    if (typeof body === 'string' && depth < 4) {
      const inner = simpleCommands(body, depth + 1);
      if (inner === null) return null;
      out.push(...inner);
    }
  }
  return out;
}

// Where the repository's checkouts are, from `cwd`: { main, slots } (real paths), or null outside a git checkout.
export function placesOf(cwd) {
  try {
    const main = real(listWorktrees(cwd)[0].path);
    return { main, slots: real(slotsRoot(main)) };
  } catch {
    return null;
  }
}

// Is `target` a place where work is refused: inside the main checkout and not inside the slots directory?
const refusedPlace = (target, places) => {
  const p = real(path.resolve(target));
  return inside(p, places.main) && !inside(p, places.slots);
};

const WORKTREE_VERB = { add: 'go-getter pool acquire', remove: 'go-getter pool remove <path> (or `pool release <slot>`)', prune: 'go-getter pool doctor', move: 'go-getter pool adopt <path>' };

// Words of a raw `git worktree <add|remove|prune|move>` among the commands, or null.
function rawWorktree(commands) {
  for (const eff of commands) {
    if (path.basename(eff[0]) !== 'git') continue;
    const rest = [];
    const args = eff.slice(1);
    for (let i = 0; i < args.length; i++) {
      if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i])) i++;
      else if (!args[i].startsWith('-')) rest.push(args[i]);
    }
    if (rest[0] === 'worktree' && WORKTREE_VERB[rest[1]]) return rest[1];
  }
  return null;
}

// Decides one tool call. `kind` is 'file' or 'shell'; `tool` the tool name; `command` the shell text; `paths` the file paths of a write.
// Returns null (allowed) or { verb, what } for a refusal that names the verb to run.
export function isolationRefusal({ cwd, kind, tool, command, paths = [] }) {
  const places = placesOf(cwd);
  if (!places) return null;
  let config;
  try {
    config = poolConfig(places.main);
  } catch {
    return null;
  }
  if (!config.enabled) return null;
  if (kind === 'shell' && typeof command === 'string') {
    const commands = simpleCommands(command);
    const raw = commands ? rawWorktree(commands) : null;
    if (raw) return { verb: WORKTREE_VERB[raw], what: `\`git worktree ${raw}\` bypasses the pool` };
    if (!config.only) return null;
    if (!commands) return refusedPlace(cwd, places) ? { verb: 'go-getter pool acquire', what: 'this command cannot be read, so it cannot be shown to be read-only' } : null;
    // Track the directory the commands run in: a leading `cd <dir>` or `git -C <dir>` moves them.
    let here = real(path.resolve(cwd));
    for (const eff of commands) {
      const name = path.basename(eff[0]);
      if (name === 'cd' || name === 'pushd') {
        const to = eff.slice(1).find((a) => !a.startsWith('-'));
        if (to) here = real(path.resolve(here, to));
        continue;
      }
      let at = here;
      if (name === 'git') {
        const i = eff.indexOf('-C');
        if (i > 0 && eff[i + 1]) at = real(path.resolve(here, eff[i + 1]));
      }
      if (!inside(at, places.main) || inside(at, places.slots)) continue;
      // go-getter's own verbs guard themselves, and `pool acquire` must run here. A bare `go-getter` counts by name: the hook's PATH
      // may not hold the plugin's bin directory, and then the lookup fails for the very command the refusal tells the agent to run.
      if (eff[0] === 'go-getter' || goGetterCommand(eff.join(' '), { cwd: at })) continue;
      if (!readOnlyWords(eff)) return { verb: 'go-getter pool acquire', what: `\`${eff.slice(0, 3).join(' ')}\` changes the main checkout` };
    }
    if (commands.length && redirectsToFile(command) && refusedPlace(here, places)) return { verb: 'go-getter pool acquire', what: 'the command writes a file in the main checkout' };
    return null;
  }
  if (kind === 'file' && config.only && isWriteTool(tool)) {
    const targets = paths.length ? paths : [cwd];
    const hit = targets.find((t) => refusedPlace(path.resolve(cwd, t), places));
    if (hit) return { verb: 'go-getter pool acquire', what: `${tool} edits ${path.relative(places.main, path.resolve(cwd, hit)) || '.'} in the main checkout` };
  }
  return null;
}

// The file paths a write tool's input names (the common field names, and the files of an `apply_patch` body).
export function writePaths(input) {
  if (!input || typeof input !== 'object') return [];
  const out = [];
  for (const k of ['file_path', 'filePath', 'path', 'notebook_path', 'target_file']) if (typeof input[k] === 'string') out.push(input[k]);
  const patch = input.command ?? input.patch ?? input.input;
  const text = Array.isArray(patch) ? patch.join('\n') : patch;
  if (typeof text === 'string') for (const m of text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) out.push(m[1].trim());
  return out;
}

// The program a refusal tells the agent to run. A bare `go-getter` is named only when the one on the hook's PATH knows the verb's
// command; a stale install (no `pool`) or none at all would make the refusal a dead end, so the running build is named by its entry
// script instead. A3: no refusal points at a verb unknown to the build that printed it.
const BIN = fileURLToPath(new URL('../../bin/go-getter.mjs', import.meta.url));
export function spellVerb(verb, { env = process.env } = {}) {
  if (!verb.startsWith('go-getter ')) return verb;
  const command = verb.split(' ')[1];
  let probe;
  try {
    probe = spawnSync('go-getter', [command, '--help'], { encoding: 'utf8', env, timeout: 5000 });
  } catch {
    probe = null;
  }
  const out = probe && !probe.error ? `${probe.stdout}${probe.stderr}` : '';
  if (out.includes(`usage: go-getter ${command}`)) return verb;
  return `node '${BIN}' ${verb.slice('go-getter '.length)}`;
}

export const refusalReason = (guardrail, r, options) =>
  `blocked by guardrail ${guardrail}: ${r.what}; work happens in a pool slot. Run \`${spellVerb(r.verb, options)}\` (it gives you an isolated checkout), then continue there. A person may still run the raw command themselves with "! <command>".`;
