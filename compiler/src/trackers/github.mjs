// The GitHub tracker (decision 0117): reads an issue's state through `gh`, caches what it read, and overlays it on the file
// WorkSource's steps. Reading only; the write verbs are plan step 6. Everything an issue returns is untrusted text (0119):
// a title is stripped of control characters, cut short and passed through the secret patterns before it is kept or shown.
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { STATE_DIR } from '../telemetry/record.mjs';
import { findings } from '../secrets/patterns.mjs';
import { parseRef } from './refs.mjs';
import { fileSource } from './file-source.mjs';
import { ok } from './worksource.mjs';

const GH_TIMEOUT_MS = 20_000;
const LIST_AT = 4; // from this many issues in one repository a single list call replaces one view each
const LIST_LIMIT = 1000;
const TITLE_MAX = 120;
const CACHE_FILE = 'tracker-cache.json';

// `owner/repo` of the project's origin when it is on GitHub, else null.
export function originRepo(project) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) }).trim();
    const m = /github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

// Issue text as it may be kept and shown: one line, no control characters, secrets replaced, cut short.
export function cleanTitle(text) {
  let t = String(text ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
  for (const f of findings(t).sort((a, b) => b.index - a.index)) t = `${t.slice(0, f.index)}[redacted]${t.slice(f.index + f.length)}`;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

// GitHub says open or closed with a reason; a plan step is done when the issue closed as completed, moved out of the plan
// when it closed as not planned, and otherwise still open (an open issue cannot say pending from in progress).
export function issueStateOf({ state, stateReason }) {
  if (String(state).toUpperCase() !== 'CLOSED') return 'open';
  return String(stateReason ?? '').toUpperCase() === 'NOT_PLANNED' ? 'moved' : 'done';
}

// Runs gh without a shell; `input` (when given) is written to its standard input. Rejects with the process error.
export function gh(args, project, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('gh', args, { cwd: project, timeout: GH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, env: cleanGitEnv(process.env) }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr ?? '') })) : resolve(stdout)));
    if (input !== undefined) child.stdin.end(input);
  });
}

const FIELDS = 'number,title,state,stateReason';

// Map of `owner/repo#number` to the issue gh returned, or null for one that does not exist; throws when gh cannot be reached.
// `refs` are parsed GitHub references; the repository of one written without it is origin's.
export async function fetchIssues(project, refs, origin = originRepo(project)) {
  const wanted = new Map();
  for (const ref of refs) {
    const repo = ref.repo ?? origin;
    if (!repo) continue;
    if (!wanted.has(repo)) wanted.set(repo, new Set());
    wanted.get(repo).add(ref.key);
  }
  const found = new Map();
  for (const [repo, numbers] of wanted) {
    if (numbers.size >= LIST_AT) {
      for (const issue of JSON.parse(await gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', String(LIST_LIMIT), '--json', FIELDS], project))) {
        if (numbers.has(String(issue.number))) found.set(`${repo}#${issue.number}`, issue);
      }
    }
    await Promise.all([...numbers].filter((n) => !found.has(`${repo}#${n}`)).map(async (n) => {
      try {
        found.set(`${repo}#${n}`, JSON.parse(await gh(['issue', 'view', n, '--repo', repo, '--json', FIELDS], project)));
      } catch (err) {
        if (/could not resolve|not found/i.test(String(err.stderr ?? err.message))) found.set(`${repo}#${n}`, null);
        else throw err;
      }
    }));
  }
  return found;
}

const cachePath = (project) => path.join(project, STATE_DIR, CACHE_FILE);
function readCache(project) {
  try {
    const cache = JSON.parse(readFileSync(cachePath(project), 'utf8'));
    return cache?.version === 1 && cache.issues && typeof cache.issues === 'object' ? cache.issues : {};
  } catch {
    return {};
  }
}
function writeCache(project, issues) {
  try {
    mkdirSync(path.join(project, STATE_DIR), { recursive: true });
    const file = cachePath(project);
    writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 1, issues }, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  } catch {
    // a cache that cannot be written only costs the stale fallback
  }
}

// The file WorkSource with each GitHub-issue step's state read from its issue (decision 0117): the issue decides, a step with
// no issue stays file-driven, and a disagreement is reported on the step (`mismatch`), never changed. When `gh` fails the last
// state read is used and marked stale; with none, the step keeps its file state and is marked stale and unknown.
export function githubSource(file, { project, name = file, now = () => new Date() } = {}) {
  const base = fileSource(file, { name });
  const overlay = async (steps) => {
    const refs = new Map();
    for (const s of steps) {
      const ref = s.issue === undefined ? null : parseRef(s.issue);
      if (ref?.tracker === 'github') refs.set(s.id, ref);
    }
    if (!refs.size) return steps;
    const origin = originRepo(project);
    let live = null;
    try {
      live = await fetchIssues(project, [...refs.values()], origin);
    } catch {
      live = null;
    }
    const cache = readCache(project);
    const stamp = now().toISOString();
    const out = steps.map((s) => {
      const ref = refs.get(s.id);
      if (!ref) return s;
      const repo = ref.repo ?? origin;
      const key = repo ? `${repo}#${ref.key}` : null;
      let issueState;
      const issue = key && live ? live.get(key) : undefined;
      if (issue) {
        issueState = { tracker: 'github', ref: key, state: issueStateOf(issue), title: cleanTitle(issue.title), fetchedAt: stamp, stale: false };
        cache[key] = { state: issueState.state, title: issueState.title, fetchedAt: stamp };
      } else if (issue === null) {
        issueState = { tracker: 'github', ref: key, state: 'unknown', stale: false, error: 'the issue was not found' };
      } else if (key && cache[key]) {
        issueState = { tracker: 'github', ref: key, state: cache[key].state, title: cache[key].title, fetchedAt: cache[key].fetchedAt, stale: true };
      } else {
        issueState = { tracker: 'github', ref: key ?? ref.text, state: 'unknown', stale: true };
      }
      const result = { ...s, issueState };
      const fileState = s.state;
      if (issueState.state === 'done' && fileState !== 'done') {
        Object.assign(result, { state: 'done', fileState, mismatch: `the issue is closed but the plan marks the step ${fileState}` });
      } else if (issueState.state === 'moved' && fileState !== 'moved') {
        Object.assign(result, { state: 'moved', fileState, mismatch: `the issue was closed as not planned but the plan marks the step ${fileState}` });
      } else if (issueState.state === 'open' && fileState === 'done') {
        Object.assign(result, { state: 'in progress', fileState, mismatch: 'the plan marks the step done but its issue is open' });
      }
      return result;
    });
    if (live) writeCache(project, cache);
    return out;
  };
  return {
    id: 'github',
    ops: base.ops,
    async handle(op, args) {
      const answer = await base.handle(op, args);
      if (!answer.ok) return answer;
      if (op === 'list') return ok({ steps: await overlay(answer.result.steps) });
      if (answer.result.step) return ok({ step: (await overlay([answer.result.step]))[0] });
      return answer;
    },
  };
}
