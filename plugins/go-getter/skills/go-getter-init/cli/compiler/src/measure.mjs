// Meters and readings (decision 0179, plan discovery-and-outcomes D3). A meter is docs/meters/<id>.md; a reading is one
// JSON line committed to refs/go-getter/readings/<meter>/<period> (the remote's when there is one, else local). A reading
// holds the meter id, time, value and reader, never free text; it is scanned for secrets and personal data before any
// push. No daemon: `due` only lists what is overdue.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { cleanGitEnv } from './git-env.mjs';
import { findings as secretFindings } from './secrets/patterns.mjs';
import { piiFindings, ALL_CLASSES } from './secrets/pii.mjs';

export const REF_PREFIX = 'refs/go-getter/readings';
export const DATA_CLASSES = ['public', 'internal', 'confidential', 'restricted'];
const REQUIRED = ['id', 'title', 'reads', 'source', 'capabilities', 'refresh', 'cost', 'noise', 'owner', 'data-class', 'retention'];
const ID = /^[a-z0-9][a-z0-9-]*$/;
const VALUE_TOKEN = /^[A-Za-z0-9._:+-]{1,40}$/;
const HOUR = 3600e3;
const UNITS = { h: HOUR, d: 24 * HOUR, w: 7 * 24 * HOUR, mo: 30 * 24 * HOUR };

// "12h", "7d", "2w", "3mo" -> milliseconds, or null.
export function parseDuration(text) {
  const m = /^(\d+)(h|d|w|mo)$/.exec(String(text ?? '').trim());
  return m ? Number(m[1]) * UNITS[m[2]] : null;
}

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String).filter(Boolean);

function git(cwd, args, input) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    env: { ...cleanGitEnv(process.env), GIT_AUTHOR_NAME: 'go-getter', GIT_AUTHOR_EMAIL: 'go-getter@localhost', GIT_COMMITTER_NAME: 'go-getter', GIT_COMMITTER_EMAIL: 'go-getter@localhost' },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
const tryGit = (cwd, args, input) => {
  try {
    return git(cwd, args, input);
  } catch {
    return null;
  }
};

// ---------- meters ----------

export function validateMeter(data) {
  const problems = [];
  for (const k of REQUIRED) if (data[k] == null || data[k] === '' || (Array.isArray(data[k]) && k !== 'capabilities' && !data[k].length)) problems.push(`missing ${k}`);
  if (data.id != null && !ID.test(String(data.id))) problems.push(`id "${data.id}" must be lowercase letters, digits and hyphens`);
  if (data['data-class'] != null && !DATA_CLASSES.includes(data['data-class'])) problems.push(`data-class "${data['data-class']}" is not one of ${DATA_CLASSES.join(', ')}`);
  if (data.refresh != null && parseDuration(data.refresh) == null) problems.push(`refresh "${data.refresh}" must look like 12h, 7d, 2w or 3mo`);
  if (data.retention != null && parseDuration(data.retention) == null) problems.push(`retention "${data.retention}" must look like 12h, 7d, 2w or 3mo`);
  if (data.cost != null && !(typeof data.cost === 'number' && data.cost >= 0)) problems.push('cost must be a non-negative number (per reading)');
  return problems;
}

export function loadMeters(root) {
  const dir = path.join(root, 'docs/meters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .map((n) => {
      const file = `docs/meters/${n}`;
      let data = {};
      let problems = [];
      try {
        data = parseFrontmatter(readFileSync(path.join(root, file), 'utf8')).data;
        problems = validateMeter(data);
        if (data.id !== n.slice(0, -3)) problems.push(`id "${data.id}" does not match the file name`);
      } catch (err) {
        problems = [err.message];
      }
      return { id: n.slice(0, -3), file, data, problems };
    });
}

// Outcome briefs (docs/outcomes/*.md, built by plan step D2); a missing directory means no outcomes.
export function loadOutcomes(root) {
  const dir = path.join(root, 'docs/outcomes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .map((n) => {
      let data = {};
      try {
        data = parseFrontmatter(readFileSync(path.join(dir, n), 'utf8')).data;
      } catch {
        // An unparsable brief is D2's finding.
      }
      return { id: n.slice(0, -3), file: `docs/outcomes/${n}`, data, meters: list(data.meters) };
    });
}

const budgetOf = (o) => {
  const b = o.data.budget;
  const n = typeof b === 'object' && b ? b.amount : b;
  return typeof n === 'number' ? n : null;
};

// Lint findings (decision 0179 item 5): a meter no outcome uses, or whose cost per reading exceeds an outcome's budget.
export function meterFindings(root) {
  const outcomes = loadOutcomes(root);
  const out = [];
  for (const m of loadMeters(root)) {
    const users = outcomes.filter((o) => o.meters.includes(m.id));
    if (!users.length) out.push(`${m.file}: meter "${m.id}" is used by no outcome`);
    for (const o of users) {
      const budget = budgetOf(o);
      if (budget != null && typeof m.data.cost === 'number' && m.data.cost > budget) out.push(`${m.file}: cost per reading ${m.data.cost} exceeds the budget ${budget} of outcome ${o.id}`);
    }
  }
  return out;
}

// Copy a meter file into docs/meters/ after validating it; refuses a retention shorter than an outcome's window.
export function defineMeter(root, file) {
  const source = path.resolve(file);
  const text = readFileSync(source, 'utf8');
  const { data } = parseFrontmatter(text);
  const problems = validateMeter(data);
  if (problems.length) return { ok: false, problems };
  const retention = parseDuration(data.retention);
  for (const o of loadOutcomes(root).filter((x) => x.meters.includes(data.id))) {
    const w = parseDuration(o.data.window);
    if (w != null && retention < w) return { ok: false, problems: [`retention ${data.retention} is shorter than the window ${o.data.window} of outcome ${o.id}`] };
  }
  const rel = `docs/meters/${data.id}.md`;
  const dest = path.join(root, rel);
  if (existsSync(dest) && readFileSync(dest, 'utf8') !== text && path.resolve(dest) !== source) return { ok: false, problems: [`${rel} already exists with different content`] };
  if (path.resolve(dest) !== source) {
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  }
  const index = path.join(root, 'docs/meters/INDEX.md');
  const row = `${data.id},"${String(data.title).replace(/"/g, '""')}","${list(data.capabilities).join(', ')}",${data.status ?? 'active'}\n`;
  if (!existsSync(index)) writeFileSync(index, `# Meters index (CSV)\n\nid,title,capabilities,status\n${row}`);
  else if (!readFileSync(index, 'utf8').split('\n').some((l) => l.startsWith(`${data.id},`))) appendFileSync(index, row);
  return { ok: true, id: data.id, file: rel };
}

// ---------- readings ----------

const remoteOf = (root) => {
  const names = (tryGit(root, ['remote']) ?? '').split('\n').filter(Boolean);
  return names.includes('origin') ? 'origin' : (names[0] ?? null);
};

export const periodOf = (date) => date.toISOString().slice(0, 7);
const refFor = (meter, period) => `${REF_PREFIX}/${meter}/${period}`;

// Repository visibility is not knowable offline: it is private only when GO_GETTER_REPO_VISIBILITY says so, else public.
export const visibility = (env = process.env) => (env.GO_GETTER_REPO_VISIBILITY === 'private' ? 'private' : 'public');

// Why a reading may not be stored, or null. Only a number, a boolean or a short token is a value; free text is refused.
export function readingProblem(reading) {
  const { value } = reading;
  if (!(typeof value === 'number' && Number.isFinite(value)) && typeof value !== 'boolean' && !(typeof value === 'string' && VALUE_TOKEN.test(value))) {
    return 'value must be a number, a boolean or a short token (letters, digits, . _ : + -), never free text';
  }
  for (const [k, v] of Object.entries(reading)) {
    if (typeof v !== 'string') continue;
    const hits = [...secretFindings(v).map((f) => f.kind), ...piiFindings(v, { classes: ALL_CLASSES }).map((f) => f.kind)];
    if (hits.length) return `${k} contains ${hits.join(', ')}; a reading holds no secret or personal data`;
  }
  return null;
}

function readBlob(root, ref) {
  return tryGit(root, ['cat-file', 'blob', `${ref}:readings.jsonl`]) ?? '';
}

function commitAppend(root, ref, line, subject) {
  const parent = tryGit(root, ['rev-parse', '--verify', '-q', ref]);
  const text = parent ? `${readBlob(root, ref)}\n${line}\n` : `${line}\n`;
  const blob = git(root, ['hash-object', '-w', '--stdin'], text.replace(/^\n/, ''));
  const tree = git(root, ['mktree'], `100644 blob ${blob}\treadings.jsonl\n`);
  const commit = git(root, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', subject]);
  git(root, ['update-ref', ref, commit]);
}

export function recordReading(root, meterId, { value, reader, now = new Date(), visibilityOf = visibility(), remote } = {}) {
  const meter = loadMeters(root).find((m) => m.id === meterId);
  if (!meter) return { ok: false, problem: `no meter "${meterId}" under docs/meters/` };
  if (meter.problems.length) return { ok: false, problem: `meter "${meterId}" is invalid: ${meter.problems.join('; ')}` };
  const cls = meter.data['data-class'];
  if (visibilityOf !== 'private' && (cls === 'confidential' || cls === 'restricted')) {
    return { ok: false, problem: `meter "${meterId}" is ${cls} and this repository is public: its readings are not stored in a ref` };
  }
  const reading = { meter: meterId, time: now.toISOString(), value, reader: reader ?? tryGit(root, ['config', 'user.name']) ?? process.env.USER ?? 'unknown' };
  const problem = readingProblem(reading);
  if (problem) return { ok: false, problem };
  const ref = refFor(meterId, periodOf(now));
  const remoteName = remote === undefined ? remoteOf(root) : remote;
  const line = JSON.stringify(reading);
  if (!remoteName) {
    commitAppend(root, ref, line, `reading ${meterId}`);
    return { ok: true, reading, ref, stored: 'local', note: 'no remote: the reading is stored in a local ref only' };
  }
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    tryGit(root, ['fetch', '-q', remoteName, `+${ref}:${ref}`]);
    commitAppend(root, ref, line, `reading ${meterId}`);
    try {
      git(root, ['push', '-q', remoteName, `${ref}:${ref}`]);
      return { ok: true, reading, ref, stored: remoteName };
    } catch (err) {
      lastError = String(err.stderr ?? err.message).trim();
    }
  }
  return { ok: false, problem: `push to ${remoteName} failed after 3 attempts: ${lastError}` };
}

export function periodRefs(root, meterId) {
  return (tryGit(root, ['for-each-ref', '--format=%(refname)', `${REF_PREFIX}/${meterId}/`]) ?? '').split('\n').filter(Boolean).sort();
}

export function readings(root, meterId, { fetch = true } = {}) {
  const remoteName = remoteOf(root);
  if (fetch && remoteName) tryGit(root, ['fetch', '-q', remoteName, `+${REF_PREFIX}/${meterId}/*:${REF_PREFIX}/${meterId}/*`]);
  return periodRefs(root, meterId).flatMap((ref) =>
    readBlob(root, ref)
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );
}

export function series(root, meterId, opts) {
  const rows = readings(root, meterId, opts).sort((a, b) => a.time.localeCompare(b.time));
  const nums = rows.map((r) => r.value).filter((v) => typeof v === 'number');
  const periods = {};
  for (const r of rows) periods[r.time.slice(0, 7)] = (periods[r.time.slice(0, 7)] ?? 0) + 1;
  const agg = { count: rows.length, first: rows[0]?.time ?? null, last: rows.at(-1)?.time ?? null, latest: rows.at(-1)?.value ?? null, periods };
  if (nums.length) Object.assign(agg, { min: Math.min(...nums), max: Math.max(...nums), mean: nums.reduce((a, b) => a + b, 0) / nums.length });
  return { meter: meterId, aggregate: agg, readings: rows };
}

// Meters whose refresh interval has passed since the latest reading (never read counts as overdue).
export function due(root, { now = new Date() } = {}) {
  const out = [];
  for (const m of loadMeters(root).filter((x) => !x.problems.length && (x.data.status ?? 'active') === 'active')) {
    const last = readings(root, m.id, { fetch: false }).map((r) => r.time).sort().at(-1) ?? null;
    const overdue = last == null || now.getTime() - Date.parse(last) >= parseDuration(m.data.refresh);
    if (overdue) {
      out.push({
        meter: m.id,
        last,
        unit: { kind: 'measure', title: `Read meter ${m.id}`, capabilities: list(m.data.capabilities), accept: `go-getter measure read ${m.id} --value <value>` },
      });
    }
  }
  return out;
}

// Delete period refs whose period ended more than the retention ago.
export function expire(root, { now = new Date() } = {}) {
  const removed = [];
  const remoteName = remoteOf(root);
  for (const m of loadMeters(root).filter((x) => !x.problems.length)) {
    const keep = parseDuration(m.data.retention);
    for (const ref of periodRefs(root, m.id)) {
      const period = ref.slice(ref.lastIndexOf('/') + 1);
      const [y, mo] = period.split('-').map(Number);
      if (!y || !mo) continue;
      const end = Date.UTC(y, mo, 1);
      if (now.getTime() - end > keep) {
        git(root, ['update-ref', '-d', ref]);
        if (remoteName) tryGit(root, ['push', '-q', remoteName, `:${ref}`]);
        removed.push(ref);
      }
    }
  }
  return removed;
}
