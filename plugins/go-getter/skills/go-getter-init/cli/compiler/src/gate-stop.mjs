// What a stop tells the person and what it leaves behind (roadmap G3): every stop says what would be lost, the safe alternative
// and how to approve and remember the case; every stop is logged as metadata (class, trigger, outcome), never command text.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cleanGitEnv } from './git-env.mjs';
import { recordQuietly } from './telemetry/record.mjs';
import { FIELDS } from './telemetry/schema.mjs';

const ALTERNATIVES = {
  'git-branch-delete': 'push the branch or merge it first, or delete it with `git branch -d`, which refuses an unmerged branch',
  'git-reset-hard': 'commit or stash the changes first, or take a checkpoint (`go-getter checkpoint`) and reset after it',
  'git-rebase': 'push the branch first so its commits exist elsewhere, or take a checkpoint (`go-getter checkpoint`)',
  'git-worktree-remove': 'commit or push what the worktree holds first, or list it with `go-getter worktree list`',
};
const FALLBACK = 'take a checkpoint first (`go-getter checkpoint`) and ask the user to run it themselves';

// What the repository holds that a stateful command could lose: every ref with its commit, and the working tree's status.
function stateOf(cwd) {
  const out = (args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).stdout ?? '';
  return `${out(['for-each-ref', '--format=%(refname) %(objectname)'])}\0${out(['status', '--porcelain', '--', '.', ':(exclude).go-getter'])}`;
}

// The remembered approval of one case: the same command in the same repository state, so a case that changed asks again.
// The store holds this key and a date, never the command.
export const stopKey = (id, command, why, cwd) => `stop:${createHash('sha256').update([id, command, why ?? '', stateOf(cwd)].join('\0')).digest('hex').slice(0, 16)}`;

// `canAsk`: the host can prompt, so approving remembers the case; otherwise only a person running the command is left.
export function stopReason({ command, id, lost, key, canAsk }) {
  const approve = canAsk
    ? `Yes runs it now and remembers this exact case (same command, same state) until revoked: go-getter approvals revoke ${key}`
    : `this needs a human: ask the user to run it themselves ("! ${command}"); this host cannot ask, so nothing is remembered`;
  return `go-getter: "${command}" is stopped.\n  Lost: ${lost}\n  Instead: ${ALTERNATIVES[id] ?? FALLBACK}\n  Approve: ${approve}`;
}

// One metadata line per stop: no command, no path, no reason text. `taskClass` is the command class or guardrail id.
export function logStop(project, host, { taskClass, outcome, trigger }) {
  const rec = { event: 'gate:stop', outcome };
  if (FIELDS.taskClass(taskClass)) rec.taskClass = taskClass;
  if (FIELDS.trigger(trigger)) rec.trigger = trigger;
  if (FIELDS.host(host)) rec.host = host;
  return recordQuietly(project, rec);
}
