// The class of every point at which work waits for a person: a fixed table, read by people in review, never decided by the model
// (paper instruments, step P3). The class comes from the shape of the action, not from its arguments, so no command text is needed.
//
//   irreversible - nothing in this checkout undoes it once it happened: history rewrites, deletes, publishing, settings, secrets.
//   routine      - a person is asked, but the action can be taken back or repeated: a push, a pull request, a comment, a plain merge.
//
// A shape that is not listed counts as irreversible: an unknown action must never lower the count of irreversible approvals.
export const CLASSES = ['irreversible', 'routine'];

export const APPROVAL_CLASS = {
  // Gated command shapes (compiler/src/gate.mjs catalog ids). Every catalog id must appear here; the test checks it.
  'git-push-force': 'irreversible',
  'git-push-delete': 'irreversible',
  'git-reset-hard': 'irreversible',
  'git-rebase': 'irreversible',
  'git-filter-branch': 'irreversible',
  'git-branch-delete': 'irreversible',
  'git-worktree-remove': 'irreversible',
  'git-tag-delete': 'irreversible',
  'rm-rf': 'irreversible',
  'sql-destructive': 'irreversible',
  'repo-settings': 'irreversible',
  'git-push': 'routine',
  'pr-create': 'routine',
  'pr-merge': 'irreversible', // owner's call 2026-11-05: a merge can only be compensated (by a revert), not undone
  'pr-close': 'routine',
  'comment-post': 'routine',
  'git-tag-create': 'routine',
  'release-create': 'irreversible',
  'package-publish': 'irreversible',
  // Other stops that wait for a person.
  'release': 'irreversible', // a release approval (decisions 0094, 0155 item 2): the typed `approvals release` or the chat request
  'mcp-write': 'routine', // first use of an MCP tool that is not marked read
  'secret-path-first-use': 'irreversible', // an agent run with a secret path in its environment (data-class or security impact)
  'outward-identity': 'routine', // a go-getter command that writes outside this machine
  // Human gates (decision 0155 item 3 triggers), as parked asks in the work ledger.
  'ask-irreversible': 'irreversible', // trigger (a) hard to reverse, and any ask with a data-class or security impact
  'ask-reversible': 'routine', // triggers (b) and (d) when the ask can be undone
  'unclassified-stop': 'irreversible', // a stop whose shape is not named above
};

export const approvalClass = (action) => APPROVAL_CLASS[action] ?? 'irreversible';
export const isKnownAction = (action) => typeof action === 'string' && Object.hasOwn(APPROVAL_CLASS, action);
