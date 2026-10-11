// Personal approvals to use a secret file (decision 0126): "this command may use that file", kept per user outside git, per
// project, and bound to a hash of the code the command runs (fileset.mjs), so an approval lapses the moment that code changes.
// The store never holds a value: a command, a secret path, a hash and a date.
//
// Where: `$GO_GETTER_HOME/approvals.json` if set (the tests do), else `$XDG_STATE_HOME/go-getter/approvals.json`, else
// `~/.local/state/go-getter/approvals.json`; the directory is 0700 and the file 0600, replaced atomically. A project is
// keyed by its real path, so an identical command in another repository is not approved there.
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
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

const normalisePath = (project, secretPath) => {
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
  const rel = normalisePath(project, secretPath);
  const entry = (read(env).projects[keyOf(project)] ?? []).find((e) => e.path === rel && e.command.length === words.length && e.command.every((w, i) => w === words[i]));
  return Boolean(entry) && fileSet(words, project).hash === entry.hash;
}

// Records (or refreshes) the approval of `words` for `secretPath` against the code on disk now. Returns the entry.
export function add(project, words, secretPath, { host, now = () => new Date(), env = process.env } = {}) {
  if (!Array.isArray(words) || !words.length || words.some((w) => typeof w !== 'string')) throw new Error('an approval needs a command');
  const rel = normalisePath(project, secretPath);
  const data = read(env);
  const key = keyOf(project);
  const entry = { id: idOf(project, words, rel), command: words, path: rel, hash: fileSet(words, project).hash, approvedAt: now().toISOString(), ...(host ? { host } : {}) };
  data.projects[key] = [...(data.projects[key] ?? []).filter((e) => e.id !== entry.id), entry];
  write(data, env);
  return entry;
}

// Removes the approval with `id` (or every one of the project with `{ all: true }`). Returns how many were removed.
export function revoke(project, { id, all = false } = {}, env = process.env) {
  const data = read(env);
  const key = keyOf(project);
  const before = data.projects[key] ?? [];
  const kept = all ? [] : before.filter((e) => e.id !== id);
  if (kept.length === before.length) return 0;
  if (kept.length) data.projects[key] = kept;
  else delete data.projects[key];
  write(data, env);
  return before.length - kept.length;
}
