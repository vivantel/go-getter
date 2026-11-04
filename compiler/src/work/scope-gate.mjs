// The scope gate (decision 0167 item 2): a change may touch only paths inside the scope of the unit claimed from this worktree.
// A branch with no claimed unit reports `no unit` and passes. A change request is how a unit asks for what lies outside its scope.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { readManifest } from '../manifest.mjs';
import { STATE_DIR } from '../telemetry/record.mjs';
import { readRecord } from './ledger.mjs';
import { findUnit, parkUnit } from './ops.mjs';
import { sensitiveKinds } from './claim.mjs';
import { scopesOverlap } from './scope.mjs';

export const REQUESTS = path.join(STATE_DIR, 'change-requests.jsonl');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] });

// The units claimed from this worktree: [{ unit, scope }].
export function claimedHere(root) {
  return Object.entries(readRecord(root).claims ?? {})
    .filter(([, c]) => !c.worktree || c.worktree === root)
    .map(([unit, c]) => ({ unit, scope: c.scope ?? [], stem: c.stem }));
}

// Paths changed against `base` (committed, staged and unstaged, and new files), repo-relative.
export function changedPaths(root, base) {
  const out = new Set();
  const add = (text) => text.split('\n').filter(Boolean).forEach((p) => out.add(p));
  if (base) add(git(root, ['diff', '--name-only', `${base}...HEAD`]));
  add(git(root, ['diff', '--name-only', 'HEAD']));
  add(git(root, ['ls-files', '--others', '--exclude-standard']));
  return [...out].sort();
}

// What a unit may always touch besides its scope: its own plan file (markers, Result), files `apply` owns, generated indexes and the
// generated plugin copy; none of them is work another unit could be doing at the same time.
function exemptions(root, units) {
  const plans = new Set();
  for (const u of units) {
    const found = findUnit(root, u.unit);
    if (found.file) plans.add(found.file);
  }
  const owned = new Set(Object.keys(readManifest(root)?.files ?? {}));
  return (p) => plans.has(p) || owned.has(p) || /(^|\/)INDEX\.md$/.test(p) || p.startsWith('plugins/go-getter/');
}

// { status: 'no-unit' | 'ok' | 'out-of-scope', units, outside: [paths] }.
export function checkScope(root, { base, paths } = {}) {
  const units = claimedHere(root);
  if (!units.length) return { status: 'no-unit', units: [], outside: [] };
  const exempt = exemptions(root, units);
  const scope = units.flatMap((u) => u.scope);
  const outside = (paths ?? changedPaths(root, base)).filter((p) => !exempt(p) && !scopesOverlap(scope, [p]));
  return { status: outside.length ? 'out-of-scope' : 'ok', units: units.map((u) => u.unit), outside };
}

export function formatScope(r) {
  if (r.status === 'no-unit') return 'scope: no unit is claimed from this worktree, so no scope applies';
  if (r.status === 'ok') return `scope: ${r.units.join(', ')}: every changed path is inside the claimed scope`;
  return `scope: ${r.units.join(', ')}: outside the claimed scope: ${r.outside.join(', ')}. File a change request to the unit that owns them (go-getter work request <unit> --to <unit>); never widen the scope`;
}

// Records that a change request was filed, as metadata only (units and time); the text goes to the tracker, never to this file.
export function recordRequest(root, { from, to, how, parked }) {
  mkdirSync(path.join(root, STATE_DIR), { recursive: true });
  appendFileSync(path.join(root, REQUESTS), `${JSON.stringify({ ts: new Date().toISOString(), from, to, how, parked: Boolean(parked) })}\n`);
}

const REQUEST_MAX = 20_000;

// Files a change request from the unit claimed here to the unit that owns what it needs (decision 0167 item 2): a comment on the
// target's issue through `comment(text, { file, step })` when the project allows tracker writes and the target has an issue, else the
// text is returned for a person to post. `park` also parks the requesting unit, releasing its scope until the answer.
export async function requestChange(root, from, to, who, { text, park = false, comment, now, remote } = {}) {
  const mine = claimedHere(root).find((u) => u.unit === from || u.unit.split('#')[1] === from);
  if (!mine) return { ok: false, error: `${from} is not claimed from this worktree` };
  const target = findUnit(root, to);
  if (target.error) return { ok: false, error: target.error };
  if (target.unit === mine.unit) return { ok: false, error: 'a unit cannot file a change request to itself' };
  const body = `Change request from ${mine.unit}: ${String(text ?? '').trim() || 'see the unit owning the paths below'}`.slice(0, REQUEST_MAX);
  const kinds = sensitiveKinds([body]);
  if (kinds.length) return { ok: false, error: `refused: the request would send ${kinds.join(', ')}; remove it from the text` };
  let how = 'local';
  let error = null;
  if (comment && target.step.issueRef) {
    const r = await comment(body, { file: target.file, step: target.step });
    if (r?.ok) how = 'comment';
    else error = r?.error ?? 'the tracker comment was not posted';
  }
  let parked = null;
  if (park) {
    parked = await parkUnit(root, mine.unit, who, { to: target.unit, now, remote });
    if (!parked.ok) return { ok: false, error: `the request was filed (${how}) but ${parked.error}`, how, text: body };
  }
  recordRequest(root, { from: mine.unit, to: target.unit, how, parked: park });
  return { ok: true, from: mine.unit, to: target.unit, how, parked: Boolean(parked), text: body, ...(error ? { warning: error } : {}) };
}
