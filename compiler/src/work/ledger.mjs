// The git side of claims (decision 0166): the per-feature ledger ref, the per-worker heartbeat ref, read, written and pushed with plain git. A push is always a fast-forward of the version just read (the host refuses
// anything else, which is the compare-and-swap); force is never used. With no remote the same refs are local and the
// update is a compare-and-swap on the local ref. go-getter's own pushes skip the git hooks and set `GO_GETTER_REENTRY`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';

export const LEDGER_REF = 'refs/go-getter/claims';
export const HEARTBEAT_REF = 'refs/go-getter/heartbeat';
const CACHE = 'refs/go-getter/cache';
export const APPROVAL_SUFFIX = '.approval.json'; // intake approvals share the ledger tree but are not claims (decision 0174 item 3)
const ZERO = '0'.repeat(40);

export const ledgerRef = (stem) => `${LEDGER_REF}/${stem}`;
export const heartbeatRef = (worker) => `${HEARTBEAT_REF}/${worker}`;
// A worker id as it may appear in a ref name and an author name: no spaces, no `@` (an address would be personal data).
export const workerId = (raw) => String(raw ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 64) || 'worker';

// Whether a worker id is usable in a ref name: git refuses `..` and a `.lock` suffix.
export const badWorkerId = (id) => id.includes('..') || id.endsWith('.lock');

export function git(cwd, args, { input, env = {}, allowFail = false, timeout } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', input, timeout, stdio: ['pipe', 'pipe', 'pipe'], env: { ...cleanGitEnv(process.env), ...env } }).replace(/\n$/, '');
  } catch (e) {
    if (allowFail) return null;
    throw Object.assign(new Error((e.stderr?.toString().trim() || e.message).split('\n')[0]), { stderr: e.stderr?.toString() ?? '' });
  }
}

export const toplevel = (cwd) => git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });

// The remote claims are shared through: `name` if given, else origin when the repository has one; null means local-only.
export function remoteOf(root, name) {
  const n = name ?? 'origin';
  return git(root, ['remote', 'get-url', n], { allowFail: true }) ? n : null;
}

const PUSH_ENV = { GO_GETTER_REENTRY: '1', GIT_TERMINAL_PROMPT: '0' };
const NET = { allowFail: true, env: PUSH_ENV, timeout: 20_000 }; // a network read that gives up rather than hang

// Fetches `ref` of the remote into the cache ref. { tip, online }: tip null when the remote has no such ref; online false when
// the remote could not be reached.
function fetchRef(root, remote, ref, cache) {
  const ls = git(root, ['ls-remote', remote, ref], NET);
  if (ls === null) return { tip: null, online: false };
  const tip = ls.split('\n').map((l) => l.split('\t')).find(([, r]) => r === ref)?.[0] ?? null;
  if (!tip) return { tip: null, online: true };
  if (git(root, ['cat-file', '-e', `${tip}^{commit}`], { allowFail: true }) === null) {
    if (git(root, ['fetch', '--no-tags', '--quiet', remote, `+${ref}:${cache}`], NET) === null) return { tip: null, online: false };
  } else git(root, ['update-ref', cache, tip]);
  return { tip, online: true };
}

// The ledger of one feature as it is now. { tip, online, local } (local: no remote, the ref is in this repository).
export function fetchLedger(root, stem, remote, { accept = false } = {}) {
  if (!remote) return { tip: git(root, ['rev-parse', '--verify', '--quiet', ledgerRef(stem)], { allowFail: true }) || null, online: true, local: true };
  const cache = `${CACHE}/claims/${stem}`;
  if (accept) git(root, ['update-ref', '-d', cache], { allowFail: true });
  const seen = git(root, ['rev-parse', '--verify', '--quiet', cache], { allowFail: true }) || null;
  const got = fetchRef(root, remote, ledgerRef(stem), cache);
  const rewound = got.online && seen && (!got.tip || (got.tip !== seen && git(root, ['merge-base', '--is-ancestor', seen, got.tip], { allowFail: true }) === null));
  if (rewound) {
    git(root, ['update-ref', cache, seen]); // keep trusting the last version seen
    return { tip: seen, online: true, local: false, diverged: true, remoteTip: got.tip, recovery: divergedRecovery(stem) };
  }
  return { ...got, local: false };
}

// What to do when a remote ledger no longer continues the one this clone saw (rewritten, or deleted by an admin).
export const divergedRecovery = (stem) => `if the owner meant to reset the ledger, accept it with --accept-remote-ledger on this verb (it deletes only this clone's cache, \`git update-ref -d ${CACHE}/claims/${stem}\`); claims written before the reset are then forgotten`;

// The last ledger read, with no network: the cache of the remote's, else the local ref. Null when never read.
export function cachedLedger(root, stem) {
  return git(root, ['rev-parse', '--verify', '--quiet', `${CACHE}/claims/${stem}`], { allowFail: true }) || git(root, ['rev-parse', '--verify', '--quiet', ledgerRef(stem)], { allowFail: true }) || null;
}

// Remembers a ledger commit this worker just pushed as the last one seen.
export const noteLedger = (root, stem, commit) => git(root, ['update-ref', `${CACHE}/claims/${stem}`, commit], { allowFail: true });

// Every version of every entry at `tip`: [{ file, versions: [{ entry|null, author, commit }] }], oldest version first.
export function readHistory(root, tip) {
  if (!tip) return [];
  const files = git(root, ['ls-tree', '--name-only', tip]).split('\n').filter((f) => f.endsWith('.json') && !f.endsWith(APPROVAL_SUFFIX));
  return files.map((file) => {
    const log = git(root, ['log', '--reverse', '--format=%H%x1f%an', tip, '--', file]).split('\n').filter(Boolean);
    const versions = log.map((line) => {
      const [commit, author] = line.split('\x1f');
      let entry = null;
      try {
        entry = JSON.parse(git(root, ['show', `${commit}:${file}`]));
      } catch {
        entry = null;
      }
      return { entry, author, commit };
    });
    return { file, versions };
  });
}

// A commit on top of `tip` (null for the first) that writes `files` ({ name: object }). The author and committer are the worker.
export function commitEntries(root, tip, files, { author, message, now }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-ledger-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
    if (tip) git(root, ['read-tree', tip], { env });
    for (const [name, value] of Object.entries(files)) {
      if (value === null) {
        git(root, ['update-index', '--force-remove', name], { env });
        continue;
      }
      const blob = git(root, ['hash-object', '-w', '--stdin'], { input: `${JSON.stringify(value, null, 2)}\n` });
      git(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${name}`], { env });
    }
    return commitTree(root, git(root, ['write-tree'], { env }), tip ? [tip] : [], { author, message, now });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function commitTree(root, tree, parents, { author, message, now }) {
  const stamp = now.toISOString();
  const env = { GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: `${author}@go-getter.invalid`, GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: `${author}@go-getter.invalid`, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp };
  return git(root, ['-c', 'commit.gpgsign=false', 'commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message], { env });
}

// Pushes `commit` as the new value of `ref`, a fast-forward of `expected` (null when the ref is new). { ok } | { rejected } |
// { offline }. A refusal because the ref moved is `rejected`; any other failure is `offline` (nothing was changed).
export function pushRef(root, remote, ref, commit, expected) {
  if (!remote) {
    return git(root, ['update-ref', ref, commit, expected ?? ZERO], { allowFail: true }) === null ? { rejected: true } : { ok: true };
  }
  try {
    execFileSync('git', ['push', '--no-verify', '--quiet', '--porcelain', remote, `${commit}:${ref}`], { cwd: root, timeout: 30_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanGitEnv(process.env), ...PUSH_ENV } });
    return { ok: true };
  } catch (e) {
    const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (/\[remote rejected\]/i.test(text) && !/cannot lock|failed to update ref|already exists/i.test(text)) return { offline: true, error: text.split('\n').find((l) => /rejected/i.test(l))?.trim() ?? text.split('\n')[0] };
    if (/rejected|non-fast-forward|fetch first|stale info|\[remote rejected\]/i.test(text)) return { rejected: true };
    return { offline: true, error: text.split('\n')[0] };
  }
}

// ---- heartbeats

// Heartbeat times of every claim: { beats: Map key -> [ms ascending], online }. A heartbeat names the units it renews, so the map is keyed `<worker> <unit>`
// (one worker's beat from one worktree never keeps its claim from another alive). A beat counts only when its commit was authored by
// that worker and is dated no later than `nowMs + skewMs`: a later one is ignored, not capped. A failed fetch is `online: false`:
// the caller must not judge liveness from a stale cache.
export function readBeats(root, remote, { nowMs = Date.now(), skewMs = 0, fetch = true } = {}) {
  const beats = new Map();
  let online = true;
  if (remote && fetch) online = git(root, ['fetch', '--no-tags', '--quiet', remote, `+${HEARTBEAT_REF}/*:${CACHE}/heartbeat/*`], NET) !== null;
  const prefix = beatPrefix(remote);
  const out = git(root, ['for-each-ref', '--format=%(refname)', prefix], { allowFail: true }) ?? '';
  for (const ref of out.split('\n').filter(Boolean)) {
    const id = ref.slice(prefix.length + 1);
    for (const { ms, units } of parseBeats(root, remote, id, { nowMs, skewMs })) for (const u of units) beats.set(`${id} ${u}`, [...(beats.get(`${id} ${u}`) ?? []), ms].sort((a, b) => a - b));
  }
  return { beats, online };
}

const beatPrefix = (remote) => (remote ? `${CACHE}/heartbeat` : HEARTBEAT_REF);

function parseBeats(root, remote, id, { nowMs, skewMs }) {
  const out = git(root, ['log', '-n', '500', '--format=%an\t%s', `${beatPrefix(remote)}/${id}`], { allowFail: true }) ?? '';
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .filter(([author, subject]) => author === id && /^heartbeat \d+/.test(subject ?? ''))
    .map(([, subject]) => {
      const [, ms, ...units] = subject.split(/\s+/);
      return { ms: Number(ms), units };
    })
    .filter((b) => b.ms <= nowMs + skewMs);
}

// A function (worker id, unit) -> the times (ms, ascending) of that worker's valid heartbeats that renewed the unit, from the
// heartbeat refs already fetched. Lazy and memoized.
export function beatTimes(root, remote, opts = {}) {
  const memo = new Map();
  return (id, unit) => {
    if (!memo.has(id)) memo.set(id, parseBeats(root, remote, id, { nowMs: opts.nowMs ?? Date.now(), skewMs: opts.skewMs ?? 0 }));
    return memo.get(id).filter((b) => b.units.includes(unit)).map((b) => b.ms).sort((x, y) => x - y);
  };
}

const emptyTree = (root) => git(root, ['mktree'], { input: '' });

// One heartbeat: a tiny commit on the worker's own ref, a fast-forward of what the remote holds. It touches neither the ledger,
// the working tree, any other ref nor the tracker. { ok, pushed } | { offline } | { rejected }.
export function pushHeartbeat(root, remote, worker, units, now) {
  const ref = heartbeatRef(worker);
  const own = remote ? fetchRef(root, remote, ref, `${CACHE}/beat/${ref.replace(/\//g, '_')}`) : { tip: git(root, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true }) || null, online: true };
  if (!own.online) return { offline: true };
  const commit = commitTree(root, emptyTree(root), own.tip ? [own.tip] : [], { author: worker, message: `heartbeat ${now.getTime()} ${units.join(' ')}`, now });
  const r = pushRef(root, remote, ref, commit, own.tip);
  if (r.offline) return { offline: true };
  if (r.rejected) return { rejected: true, ref };
  return { ok: true, pushed: [ref] };
}

// ---- the worker's local record: which claims it holds, so any verb can renew without asking the remote

// <git common dir> found by walking up from `cwd` (no git process: this runs after every verb).
export function commonGitDir(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const dot = path.join(dir, '.git');
    if (existsSync(dot)) {
      try {
        const text = readFileSync(dot, 'utf8');
        const m = /^gitdir:\s*(.+)$/m.exec(text);
        if (!m) return dot;
        const gitdir = path.resolve(dir, m[1].trim());
        const common = path.join(gitdir, 'commondir');
        return existsSync(common) ? path.resolve(gitdir, readFileSync(common, 'utf8').trim()) : gitdir;
      } catch {
        return dot; // a directory: readFileSync threw
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// The git directory of the worktree holding `cwd` (for a linked worktree, its own directory under the common one), by walking up.
export function worktreeGitDir(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const dot = path.join(dir, '.git');
    if (existsSync(dot)) {
      try {
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf8'));
        return m ? path.resolve(dir, m[1].trim()) : dot;
      } catch {
        return dot;
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const recordFile = (cwd) => {
  const c = commonGitDir(cwd);
  return c && path.join(c, 'go-getter-claims.json');
};

export function readRecord(cwd) {
  const f = recordFile(cwd);
  try {
    return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { claims: {} };
  } catch {
    return { claims: {} };
  }
}

// Changes the record by re-reading it right before the write and replacing the file atomically, so a torn read never empties it
// and another worktree's claims survive. `mutate(record)` edits in place.
export function updateRecord(cwd, mutate) {
  const f = recordFile(cwd);
  if (!f) return null;
  const record = readRecord(cwd);
  record.claims ??= {};
  mutate(record);
  mkdirSync(path.dirname(f), { recursive: true });
  const tmpFile = `${f}.${process.pid}.tmp`;
  writeFileSync(tmpFile, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmpFile, f);
  return record;
}
