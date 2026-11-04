// A release the user asks for in the chat is the approval to merge it (decision 0187). The host's user-prompt hook parses the prompt and
// saves the parsed request here; the pre-tool hook hands `release --batch` a claim on it; the CLI takes it at its approval check.
// Records hold the repository, the host session, the time, the release asked for and the default branch head, never the prompt text.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { storeDir } from './secrets/approvals.mjs';
import { cleanGitEnv } from './git-env.mjs';

export const REQUEST_TTL_MS = 60 * 60 * 1000;
export const CLAIM_TTL_MS = 10 * 60 * 1000;

const GRAMMAR = /^release (?:the )?(?:next )?(patch|minor|major)$|^release v?(\d+\.\d+\.\d+)$/;

// The prompt folded for matching: NFKC, no zero-width characters, lower case, one space between words, no trailing `.` or `!`.
export const normalizePrompt = (text) => String(text).normalize('NFKC').replace(/[​-‍⁠﻿]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').trim();

// `{ bump }` or `{ version }` when the whole prompt is a release request, else null. A bare `release` is not one.
export function parseRelease(text) {
  if (typeof text !== 'string') return null;
  const m = GRAMMAR.exec(normalizePrompt(text));
  if (!m) return null;
  return m[1] ? { bump: m[1] } : { version: m[2] };
}

export const MAX_MESSAGE_CHARS = 80;

// A cost gate and not the understanding: only a short message with a word that could be about releasing is read by a model, so a
// pasted document or an ordinary sentence costs nothing. The same test denies an agent scheduling such text for the user's turn.
export const looksLikeReleaseTalk = (text) => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= MAX_MESSAGE_CHARS && /\b(?:release|ship|publish|cut|go|patch|minor|major|prod|production|beta)\b/i.test(text);

// The texts in a tool call's input that the host could later submit as the user's prompt (a scheduled task's prompt, a wake-up's
// prompt, a message to the main conversation), found by the field names that carry them.
const PROMPT_FIELDS = new Set(['prompt', 'message', 'text', 'body']);
export function promptTexts(value, depth = 0) {
  if (depth >= 4 || value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => (typeof v === 'string' ? (PROMPT_FIELDS.has(k.toLowerCase()) ? [v] : []) : promptTexts(v, depth + 1)));
}

// The repository, the same from any of its worktrees: the real path of its git common directory.
export function repoKey(project) {
  try {
    const dir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: project, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return realpathSync(path.resolve(project, dir));
  } catch {
    return realpathSync(project);
  }
}

const dirs = (env) => ({ requests: path.join(storeDir(env), 'release-requests'), claims: path.join(storeDir(env), 'release-claims') });

function readAll(dir, ttl, now) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const file = path.join(dir, name);
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (now - Date.parse(data.at) > ttl || !(now - Date.parse(data.at) >= -60_000)) unlinkSync(file);
      else out.push({ id: name.slice(0, -5), file, data });
    } catch {
      // unreadable or removed by another process: not a usable record
    }
  }
  return out;
}

const write = (dir, id, data) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(data)}\n`, { flag: 'wx', mode: 0o600 });
};

// Saves a request; `release` is `{ bump }` or `{ version }`. Needs a non-empty session and the default branch head at this moment.
export function recordRequest(project, { session, release, head, now = Date.now(), env = process.env }) {
  if (!session || !head || !release) return null;
  const id = randomBytes(8).toString('hex');
  write(dirs(env).requests, id, { repo: repoKey(project), session, release, head, at: new Date(now).toISOString() });
  readAll(dirs(env).requests, REQUEST_TTL_MS, now); // drops what expired
  return id;
}

// Hands the CLI a claim on this session's newest fresh request for this repository. Null when there is none.
export function claimRequest(project, { session, now = Date.now(), env = process.env }) {
  if (!session) return null;
  const repo = repoKey(project);
  const mine = readAll(dirs(env).requests, REQUEST_TTL_MS, now)
    .filter((r) => r.data.repo === repo && r.data.session === session)
    .sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at))[0];
  if (!mine) return null;
  try {
    write(dirs(env).claims, mine.id, { repo, request: mine.id, at: new Date(now).toISOString() });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err; // already claimed: the same request
  }
  return mine.id;
}

// The fresh requests saved for this repository, for `approvals list`.
export const pendingRequests = (project, { now = Date.now(), env = process.env } = {}) => readAll(dirs(env).requests, REQUEST_TTL_MS, now).map((r) => r.data).filter((r) => r.repo === repoKey(project));

// The partial version a person says ("6", "0.3", "1.0", "v1.2.3") as a full one, or null.
export function fullVersion(text) {
  const m = /^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?$/.exec(String(text ?? '').trim());
  return m ? `${Number(m[1])}.${Number(m[2] ?? 0)}.${Number(m[3] ?? 0)}` : null;
}

const RANK = { patch: 0, minor: 1, major: 2 };
const parts = (v) => v.split('.').map(Number);
export const compareFull = (a, b) => parts(a).reduce((d, x, i) => d || x - parts(b)[i], 0);
// The bump a version is from the last one: the biggest part that changed.
export const bumpBetween = (from, to) => { const [a, b] = [parts(from), parts(to)]; return a[0] !== b[0] ? 'major' : a[1] !== b[1] ? 'minor' : 'patch'; };

// What a request lets ship, given what the commits make: `{ version, bump }`, or `{ reason }`. A bare request releases what the commits
// make; a named bump may go up and never down (a feature cannot ship as a patch); a version must be above the last release and not
// below what the commits require. What ships is still the commits at the head the person saw; only the number is theirs.
export function resolveAsk(asked, { from, bump, version, nextVersion }) {
  if (asked.version) {
    const v = fullVersion(asked.version);
    if (!v) return { reason: `${asked.version} is not a version` };
    if (compareFull(v, from) <= 0) return { reason: `you asked for v${v}, which is not above the last release v${from}` };
    if (compareFull(v, version) < 0) return { reason: `you asked for v${v} but the commits need at least v${version}; ask for that or higher` };
    return { version: v, bump: bumpBetween(from, v) };
  }
  if (asked.bump) {
    if (RANK[asked.bump] < RANK[bump]) return { reason: `you asked for a ${asked.bump} release but the commits make a ${bump} release (v${version}); a ${asked.bump} would hide that; ask for ${bump} or higher` };
    return { version: nextVersion(from, asked.bump), bump: asked.bump };
  }
  return { version, bump };
}

// The newest claimed, unexpired request of this repository: `{ request, file, claim }`; null when nothing is claimed. The head it was made at
// does not bind it: what the user asked for is a version, and `resolveAsk` refuses when the commits now need more than was asked.
export function peekRequest(project, { now = Date.now(), env = process.env }) {
  const repo = repoKey(project);
  const requests = readAll(dirs(env).requests, REQUEST_TTL_MS, now);
  const claimed = readAll(dirs(env).claims, CLAIM_TTL_MS, now)
    .filter((c) => c.data.repo === repo)
    .map((claim) => ({ claim, request: requests.find((r) => r.id === claim.data.request) }))
    .filter((c) => c.request)
    .sort((a, b) => Date.parse(b.request.data.at) - Date.parse(a.request.data.at) || (a.request.id < b.request.id ? 1 : -1));
  if (!claimed.length) return null;
  const [newest] = claimed;
  return { request: newest.request.data, file: newest.request.file, claim: newest.claim.file };
}

// Spends a peeked request: removed once, so of two takers only one succeeds.
export function spendRequest(peeked) {
  try {
    unlinkSync(peeked.file);
  } catch {
    return false;
  }
  try {
    unlinkSync(peeked.claim);
  } catch {
    // the claim expires on its own
  }
  return true;
}
