// Personal approvals to use a secret file (decision 0126): "this command may use that file", kept per user outside git, per
// project, and bound to a hash of the code the command runs (fileset.mjs), so an approval lapses the moment that code changes.
// The store never holds a value: a command, a secret path, a hash and a date.
//
// Where: `$GO_GETTER_HOME/approvals.json` if set (the tests do), else `$XDG_STATE_HOME/go-getter/approvals.json`, else
// `~/.local/state/go-getter/approvals.json`; the directory is 0700 and the file 0600, replaced atomically. A project is
// keyed by its real path, so an identical command in another repository is not approved there.
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileSet } from './fileset.mjs';

const VERSION = 1;

export function storeDir(env = process.env) {
  if (env.GO_GETTER_HOME) return path.resolve(env.GO_GETTER_HOME);
  return path.join(env.XDG_STATE_HOME ? path.resolve(env.XDG_STATE_HOME) : path.join(os.homedir(), '.local', 'state'), 'go-getter');
}
export const storeFile = (env = process.env) => path.join(storeDir(env), 'approvals.json');

const keyOf = (project) => realpathSync(project);
const idOf = (project, words, secretPath) => createHash('sha256').update([keyOf(project), secretPath, ...words].join('\0')).digest('hex').slice(0, 8);

// A read-modify-write of the store runs under a create-exclusive lock file, so parallel writers (several agents, hooks and a person)
// cannot overwrite each other's update. A lock older than LOCK_STALE_MS belongs to a process that died and is taken over by an
// exclusive takeover step (below), so several waiters that saw the same stale lock cannot each remove the other's fresh one.
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 15_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The lock holds `pid time`; one that cannot be read (just created, or written by an older version) is aged by its mtime.
function lockAge(file) {
  try {
    const written = Number(readFileSync(file, 'utf8').split(' ')[1]);
    if (Number.isFinite(written) && written > 0) return Date.now() - written;
  } catch {
    // fall through to the file time
  }
  return Date.now() - statSync(file).mtimeMs;
}

// One waiter at a time takes a stale lock over, holding `<lock>.takeover` (create-exclusive). It reads the age again inside, so a
// lock another waiter has just replaced is fresh and is left alone; the others skip and retry.
function takeOver(lock) {
  const gate = `${lock}.takeover`;
  try {
    closeSync(openSync(gate, 'wx', 0o600));
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    if (Date.now() - statSync(gate).mtimeMs > LOCK_STALE_MS) unlinkSync(gate); // its holder died
    return;
  }
  try {
    if (lockAge(lock) > LOCK_STALE_MS) unlinkSync(lock);
  } finally {
    unlinkSync(gate);
  }
}

function locked(env, fn) {
  const dir = storeDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, 'store.lock');
  const until = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600);
      writeSync(fd, `${process.pid} ${Date.now()}`);
      closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (lockAge(lock) > LOCK_STALE_MS) takeOver(lock);
      } catch {
        // released or taken over by another process meanwhile
      }
      if (Date.now() > until) throw new Error(`the approvals store is locked (${lock}); remove it if no go-getter command is running`);
      sleep(5);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // already gone
    }
  }
}

function read(env) {
  try {
    const data = JSON.parse(readFileSync(storeFile(env), 'utf8'));
    return data?.version === VERSION && data.projects && typeof data.projects === 'object' ? data : { version: VERSION, projects: {} };
  } catch {
    return { version: VERSION, projects: {} };
  }
}

function write(data, env) {
  const dir = storeDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = storeFile(env);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

export const relativeSecretPath = (project, secretPath) => {
  const abs = path.resolve(project, secretPath);
  const rel = path.relative(realpathSync(project), existsSync(abs) ? realpathSync(abs) : abs);
  return rel.split(path.sep).join('/');
};

// The approvals recorded for `project`: [{ id, command, path, hash, approvedAt, host?, current, files, resolved }]. `current` is
// whether the code the command runs still hashes to what was approved; `files` how many project files the hash covers.
export function list(project, env = process.env) {
  const entries = read(env).projects[keyOf(project)] ?? [];
  return entries.map((e) => {
    const now = fileSet(e.command, project);
    return { ...e, current: now.hash === e.hash, files: now.files.length, resolved: now.resolved };
  });
}

// Whether `words` (the command that runs) may use `secretPath` in `project`: an approval for exactly that command and path whose
// hash still matches the code on disk.
export function approved(project, words, secretPath, env = process.env) {
  if (!Array.isArray(words) || !words.length) return false;
  const rel = relativeSecretPath(project, secretPath);
  const entry = (read(env).projects[keyOf(project)] ?? []).find((e) => e.path === rel && e.command.length === words.length && e.command.every((w, i) => w === words[i]));
  return Boolean(entry) && fileSet(words, project).hash === entry.hash;
}

// Records (or refreshes) the approval of `words` for `secretPath` against the code on disk now. Returns the entry.
export function add(project, words, secretPath, { host, now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    if (!Array.isArray(words) || !words.length || words.some((w) => typeof w !== 'string')) throw new Error('an approval needs a command');
    const rel = relativeSecretPath(project, secretPath);
    const data = read(env);
    const key = keyOf(project);
    const entry = { id: idOf(project, words, rel), command: words, path: rel, hash: fileSet(words, project).hash, approvedAt: now().toISOString(), ...(host ? { host } : {}) };
    data.projects[key] = [...(data.projects[key] ?? []).filter((e) => e.id !== entry.id), entry];
    write(data, env);
    return entry;
  });
}

// Removes the approval with `id` (or every one of the project with `{ all: true }`). Returns how many were removed.
export function revoke(project, { id, all = false } = {}, env = process.env) {
  return locked(env, () => {
    const data = read(env);
    const key = keyOf(project);
    const before = data.projects[key] ?? [];
    const kept = all ? [] : before.filter((e) => e.id !== id);
    if (kept.length === before.length) return 0;
    if (kept.length) data.projects[key] = kept;
    else delete data.projects[key];
    write(data, env);
    return before.length - kept.length;
  });
}

// --- pending approvals -----------------------------------------------------------------------------------------------------
// When the pre-tool hook asks the person to approve a command's first use of a secret, it leaves a single-use
// record here; `secret run` turns it into a lasting approval when the call goes ahead (the person said yes) and refuses when
// there is none, so a call the hook never saw cannot approve itself. It is keyed like an approval and holds no value.
// Long enough for a person to answer a prompt they were not watching; the record is single use and exact, and anything that can run
// a script can read a secret file directly anyway, so a longer window adds no capability.
export const PENDING_TTL_MS = 30 * 60 * 1000;
const pendingFile = (env) => path.join(storeDir(env), 'pending.json');

function readPending(env, now) {
  try {
    const data = JSON.parse(readFileSync(pendingFile(env), 'utf8'));
    return (Array.isArray(data?.items) ? data.items : []).filter((i) => Date.parse(i.createdAt) + PENDING_TTL_MS > now.getTime());
  } catch {
    return [];
  }
}

function writePending(items, env) {
  const dir = storeDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${pendingFile(env)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: VERSION, items }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, pendingFile(env));
}

export function addPending(project, words, secretPath, { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    const rel = relativeSecretPath(project, secretPath);
    const item = { project: keyOf(project), command: words, path: rel, hash: fileSet(words, project).hash, createdAt: now().toISOString() };
    const others = readPending(env, now()).filter((i) => !(i.project === item.project && i.path === rel && i.command.join('\0') === words.join('\0')));
    writePending([...others, item], env);
    return item;
  });
}

// True once, if the hook left an unexpired record for exactly this command and path and the code still hashes to what it saw.
export function takePending(project, words, secretPath, { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    const rel = relativeSecretPath(project, secretPath);
    const items = readPending(env, now());
    const at = items.findIndex((i) => i.project === keyOf(project) && i.path === rel && i.command.join('\0') === words.join('\0') && i.hash === fileSet(words, project).hash);
    if (at < 0) return false;
    items.splice(at, 1);
    writePending(items, env);
    return true;
  });
}

// --- approved shapes -------------------------------------------------------------------------------------------------------
// "This outward command shape (a catalog id such as pr-merge) may run without asking in this project" (decision 0130 item 2).
// Same file and rules as the secret approvals, under a `shapes` key per project; it holds an id and a date, never a command's
// arguments. Whether a use is allowed is decided at each use by the shape's preconditions (runs/shapes.mjs), not here.
export function shapeApproved(project, id, env = process.env) {
  return (read(env).shapes?.[keyOf(project)] ?? []).some((e) => e.id === id);
}

export function listShapes(project, env = process.env) {
  return read(env).shapes?.[keyOf(project)] ?? [];
}

export function addShape(project, id, { host, now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    if (typeof id !== 'string' || !id) throw new Error('an approval needs a command shape id');
    const data = read(env);
    const key = keyOf(project);
    data.shapes ??= {};
    const entry = { id, approvedAt: now().toISOString(), ...(host ? { host } : {}) };
    data.shapes[key] = [...(data.shapes[key] ?? []).filter((e) => e.id !== id), entry];
    write(data, env);
    return entry;
  });
}

// Removes the approved shape `id` (or every one with `all`). Returns how many were removed.
export function revokeShape(project, { id, all = false } = {}, env = process.env) {
  return locked(env, () => {
    const data = read(env);
    const key = keyOf(project);
    const before = data.shapes?.[key] ?? [];
    const kept = all ? [] : before.filter((e) => e.id !== id);
    if (kept.length === before.length) return 0;
    if (kept.length) data.shapes[key] = kept;
    else delete data.shapes[key];
    write(data, env);
    return before.length - kept.length;
  });
}

// A shape the hook asked the person about: single use, promoted by the post-tool hook once the call it asked about ran (so the
// person said yes). Keyed by project and the command text.
export function addPendingShape(project, id, command, { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    const item = { project: keyOf(project), shape: id, text: command, createdAt: now().toISOString() };
    const others = readPending(env, now()).filter((i) => !(i.project === item.project && i.shape === id && i.text === command));
    writePending([...others, item], env);
    return item;
  });
}

// The shape id once, if an unexpired record exists for exactly this command in this project; null otherwise.
export function takePendingShape(project, command, { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    const items = readPending(env, now());
    const at = items.findIndex((i) => i.project === keyOf(project) && i.shape && i.text === command);
    if (at < 0) return null;
    const [item] = items.splice(at, 1);
    writePending(items, env);
    return item.shape;
  });
}

// --- session grants --------------------------------------------------------------------------------------------------------
// "Merge PRs from now on" typed in the chat (plan step H13): the user-prompt hook records the shape ids the user granted for that
// session, keyed by the project and a hash of the host's session id. It holds shape ids and a date, never the user's words. It is
// read like an approved shape (runs/shapes.mjs), so the shape's preconditions still decide at each use; it lapses after a day.
export const SESSION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const sessionKeyOf = (session) => createHash('sha256').update(String(session)).digest('hex').slice(0, 16);

const liveSessions = (data, key, now) => Object.fromEntries(Object.entries(data.sessions?.[key] ?? {}).filter(([, v]) => Date.parse(v.at) + SESSION_GRANT_TTL_MS > now.getTime()));

export function addSessionGrant(project, session, ids, { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    if (!session || !Array.isArray(ids) || !ids.length) throw new Error('a session grant needs a session and shape ids');
    const data = read(env);
    const key = keyOf(project);
    const sessions = liveSessions(data, key, now());
    const sk = sessionKeyOf(session);
    sessions[sk] = { ids: [...new Set([...(sessions[sk]?.ids ?? []), ...ids])], at: now().toISOString() };
    data.sessions = { ...(data.sessions ?? {}), [key]: sessions };
    write(data, env);
    return sessions[sk];
  });
}

export function sessionGranted(project, session, id, { now = () => new Date(), env = process.env } = {}) {
  if (!session) return false;
  return Boolean(liveSessions(read(env), keyOf(project), now())[sessionKeyOf(session)]?.ids.includes(id));
}

// Withdraws `ids` (all of the session's grants when none are named). Returns how many shape ids were withdrawn.
export function revokeSessionGrant(project, session, ids = [], { now = () => new Date(), env = process.env } = {}) {
  return locked(env, () => {
    if (!session) return 0;
    const data = read(env);
    const key = keyOf(project);
    const sessions = liveSessions(data, key, now());
    const sk = sessionKeyOf(session);
    const before = sessions[sk]?.ids ?? [];
    const kept = ids.length ? before.filter((i) => !ids.includes(i)) : [];
    if (kept.length === before.length) return 0;
    if (kept.length) sessions[sk] = { ...sessions[sk], ids: kept };
    else delete sessions[sk];
    data.sessions = { ...(data.sessions ?? {}), [key]: sessions };
    write(data, env);
    return before.length - kept.length;
  });
}
