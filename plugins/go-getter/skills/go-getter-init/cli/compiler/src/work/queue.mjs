// The merge queue (decision 0167 item 3, 0175 item 3): `ship` enqueues a change whose reviewer and conform passes are done, and one runner
// at a time integrates a batch of queued changes whose scopes are disjoint: rebase on the default branch, rerun only the step `Check`
// and CI, assign final artifact ids (K5) and merge on green. A red batch is bisected, the culprit's unit returns to its claimant with
// the failing check and the rest merge; a failed check is rerun once before it counts as red. The state is entries in a claims ledger
// under the stem `queue` (decision 0166's ledger, K2): `queue.json` is the runner's lease (the pseudo-unit `queue`), `pr-<n>.json` a
// queued change (written by its shipper) and `done-pr-<n>.json` its outcome (written by the runner). No file, no daemon: `run` is a
// loop a worker or CI job calls. Every command goes through the injectable `run`, so tests drive it with a fake `gh`.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { assignIds, numberFloor } from '../artifact-index.mjs';
import { readArtifacts } from '../artifacts.mjs';
import { defaultBranch } from '../git-env.mjs';
import { ShipError, defaultRunner, waitForCi } from '../ship.mjs';
import { makeEntry } from './claim.mjs';
import { commitEntries, cachedLedger, fetchLedger, ledgerRef, noteLedger, pushRef, remoteOf } from './ledger.mjs';
import { claimSettings, clockNow, readEntries } from './ops.mjs';
import { claimedHere } from './scope-gate.mjs';
import { overlap } from './scope.mjs';

export const QUEUE_STEM = 'queue';
export const QUEUE_UNIT = 'queue';
const QUEUE_LEASE_MS = 2 * 60 * 60 * 1000; // a runner's lease; renewed before each batch
const ITEM_LEASE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRIES = 8;
const backoff = (n) => Math.min(1000, 25 * 2 ** n) * (0.5 + Math.random());
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const itemFile = (pr) => `pr-${pr}.json`;
const doneFile = (pr) => `done-pr-${pr}.json`;

// Whether the project turned the queue on: the `merge-queue` answer of the adopted orchestration pack is `on`.
export function queueOn(root) {
  const data = Object.assign(
    {},
    ...readArtifacts(root, ['decisions'])
      .filter((d) => d.data.status === 'active' && String(d.data['go-getter']?.['generated-by'] ?? '').startsWith('orchestration@'))
      .map((d) => d.data['go-getter']),
  );
  return data['merge-queue'] === 'on';
}

// ---- the ledger

// One compare-and-swap write of the queue ledger. `build(entries)` returns { files, message, result } or { abort: <fail result> }.
async function writeQueue(root, who, { now = clockNow(), remote } = {}, build) {
  const settings = claimSettings(root);
  const rem = remote === undefined ? remoteOf(root) : remote;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const ledger = fetchLedger(root, QUEUE_STEM, rem);
    if (!ledger.online) return fail('offline', 'the remote could not be reached; the queue needs it (nothing was written)');
    if (ledger.diverged) return fail('diverged', 'the queue ledger on the remote does not continue the last version this clone saw, so it is not trusted and nothing was written');
    const entries = ledger.tip ? readEntries(root, ledger.tip, { skewMs: settings.skewMs }).entries : [];
    const plan = build(entries, ledger);
    if (plan.abort) return plan.abort;
    const commit = commitEntries(root, ledger.tip, plan.files, { author: who.id, message: plan.message, now });
    const pushed = pushRef(root, rem, ledgerRef(QUEUE_STEM), commit, ledger.tip);
    if (pushed.offline) return fail('offline', `the remote refused or could not be reached: ${pushed.error}`);
    if (pushed.rejected) {
      await sleep(backoff(attempt));
      continue;
    }
    if (rem) noteLedger(root, QUEUE_STEM, commit);
    return { ok: true, commit, ...(plan.result ?? {}) };
  }
  return fail('contended', 'the queue ledger kept changing; try again');
}

const isItem = (e) => e.unit.startsWith('queue#pr-');
const isDone = (e) => e.unit.startsWith('queue#done-pr-');

// The queue as it is now: { lock, pending: [item entries oldest first], done: Map pr -> result entry, entries }. `fetch` reads the remote first.
export function readQueue(root, { remote, now = clockNow(), fetch = true } = {}) {
  const settings = claimSettings(root);
  const rem = remote === undefined ? remoteOf(root) : remote;
  let tip = cachedLedger(root, QUEUE_STEM);
  if (rem && fetch) {
    const got = fetchLedger(root, QUEUE_STEM, rem);
    if (got.online && got.tip) tip = got.tip;
  }
  const entries = tip ? readEntries(root, tip, { skewMs: settings.skewMs }).entries : [];
  const done = new Map(entries.filter(isDone).map((e) => [e.result.pr, e]));
  const settled = (e) => done.get(e.item.pr)?.result.of === e.created;
  const pending = entries.filter((e) => isItem(e) && e.state === 'claimed' && !settled(e)).sort((a, b) => Date.parse(a.created) - Date.parse(b.created) || a.item.pr - b.item.pr);
  const lock = entries.find((e) => e.unit === QUEUE_UNIT);
  const live = lock && lock.state === 'claimed' && now.getTime() < Date.parse(lock.expires) + settings.skewMs ? lock : null;
  return { lock: live, pending, done, entries, settled };
}

// The outcome recorded for a queued change: { outcome: 'merged' | 'returned', reason, check?, ... } or null while it waits.
export function queueResult(root, pr, created, opts) {
  const view = readQueue(root, opts);
  const r = view.done.get(pr);
  return r && r.result.of === created ? r.result : null;
}

// Queues a change. { pr, branch, sha, title, unit, scope, check }. The scope is what the claimed unit declares (empty when none:
// an unknown scope is never shown to be disjoint, so it is integrated alone).
export async function enqueue(root, who, { pr, branch, sha, title, unit = null, scope = [], check = null }, opts = {}) {
  const now = opts.now ?? clockNow();
  return writeQueue(root, who, opts, (entries) => {
    const same = entries.find((e) => e.unit === `queue#pr-${pr}`);
    if (same && same.state === 'claimed' && same.holder.id !== who.id) return { abort: fail('held', `#${pr} is queued by ${same.holder.kind} ${same.holder.id}`) };
    const entry = { ...makeEntry({ unit: `queue#pr-${pr}`, holder: who, scope, now, leaseMs: ITEM_LEASE_MS, brief: {} }), item: { pr, branch, sha, title, unit, check } };
    return { files: { [itemFile(pr)]: entry }, message: `enqueue #${pr} by ${who.kind} ${who.id}`, result: { entry } };
  });
}

// The runner's lease on the pseudo-unit `queue`: one runner acts at a time. { ok } | { ok: false, code: 'busy', holder }.
async function acquire(root, who, opts) {
  const settings = claimSettings(root);
  const now = opts.now ?? clockNow();
  return writeQueue(root, who, opts, (entries) => {
    const held = entries.find((e) => e.unit === QUEUE_UNIT);
    const live = held && held.state === 'claimed' && now.getTime() < Date.parse(held.expires) + settings.skewMs;
    if (live && held.holder.id !== who.id) return { abort: fail('busy', `the queue is being run by ${held.holder.kind} ${held.holder.id} until ${held.expires}`, { holder: held.holder }) };
    return { files: { 'queue.json': makeEntry({ unit: QUEUE_UNIT, holder: who, scope: [], now, leaseMs: QUEUE_LEASE_MS, brief: {} }) }, message: `queue run by ${who.kind} ${who.id}` };
  });
}

async function releaseRunner(root, who, opts) {
  const now = opts.now ?? clockNow();
  return writeQueue(root, who, opts, (entries) => {
    const held = entries.find((e) => e.unit === QUEUE_UNIT);
    if (!held || held.holder.id !== who.id || held.state === 'released') return { files: {}, message: 'noop' };
    return { files: { 'queue.json': { ...held, state: 'released', updated: now.toISOString() } }, message: `queue released by ${who.kind} ${who.id}` };
  });
}

// Records outcomes: [{ item, outcome: 'merged' | 'returned', reason, check?, flaky?, ids?, batch? }].
async function record(root, who, opts, outcomes) {
  if (!outcomes.length) return { ok: true };
  const now = opts.now ?? clockNow();
  return writeQueue(root, who, opts, () => ({
    files: Object.fromEntries(outcomes.map((o) => [doneFile(o.item.item.pr), { ...makeEntry({ unit: `queue#done-pr-${o.item.item.pr}`, holder: who, scope: [], now, leaseMs: ITEM_LEASE_MS, brief: {} }), state: 'released', result: { pr: o.item.item.pr, of: o.item.created, outcome: o.outcome, reason: o.reason, unit: o.item.item.unit, ...(o.check ? { check: o.check } : {}), ...(o.flaky?.length ? { flaky: o.flaky } : {}), ...(o.ids?.length ? { ids: o.ids } : {}), ...(o.batch ? { batch: o.batch } : {}) } }])),
    message: `queue: ${outcomes.map((o) => `#${o.item.item.pr} ${o.outcome}`).join(', ')}`,
  }));
}

// ---- batching

// The first run of queued changes, oldest first, whose scopes are pairwise disjoint (K3's overlap function). A change with no declared
// scope goes alone: its overlaps are unknown.
export function pickBatch(pending) {
  if (!pending.length) return [];
  if (!pending[0].scope.length) return [pending[0]];
  const batch = [pending[0]];
  for (const e of pending.slice(1)) {
    if (!e.scope.length) continue;
    if (batch.every((b) => !overlap(b.scope, e.scope))) batch.push(e);
  }
  return batch;
}

// ---- integration

const hooksOff = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=go-getter-queue', '-c', 'user.email=queue@go-getter.invalid', '-c', 'commit.gpgsign=false'];

// Runs `command` in `dir`; a failure is rerun once, and a pass on the rerun is a flake. { ok, flaky, output }.
function runCheck(run, dir, command) {
  const go = () => run('sh', ['-c', command], { cwd: dir });
  const first = go();
  if (first.code === 0) return { ok: true, flaky: false };
  const second = go();
  if (second.code === 0) return { ok: true, flaky: true };
  return { ok: false, output: (second.err || second.out).trim().split('\n').slice(-2).join(' | ') };
}

// Builds a batch branch on the default branch from the queued changes, runs their Checks, and puts CI on it. Returns
// { status: 'green' | 'red', conflicts: [{ item, reason }], ... }. A green batch is merged by the caller.
async function tryBatch(ctx, items) {
  const { root, run, base, log, now } = ctx;
  const git = (dir, ...a) => run('git', [...hooksOff, ...a], { cwd: dir });
  const gh = (...a) => run('gh', a, { cwd: root });
  const tag = `${now.getTime().toString(36)}-${ctx.seq++}`;
  const branch = `queue/batch-${tag}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-queue-'));
  const out = { conflicts: [], flaky: [], ids: [] };
  let pr = null;
  try {
    git(root, 'fetch', '--quiet', 'origin', base);
    const added = git(root, 'worktree', 'add', '--detach', dir, `origin/${base}`);
    if (added.code !== 0) throw new ShipError(`queue: cannot create a worktree: ${added.err.trim()}`);
    const included = [];
    for (const item of items) {
      const { branch: head, sha } = item.item;
      const fetched = git(dir, 'fetch', '--quiet', 'origin', head);
      const tip = fetched.code === 0 ? git(dir, 'rev-parse', 'FETCH_HEAD').out.trim() : null;
      if (!tip) {
        out.conflicts.push({ item, reason: `branch ${head} is not on the remote any more` });
        continue;
      }
      if (sha && tip !== sha) {
        out.conflicts.push({ item, reason: `branch ${head} moved after it was queued (${sha.slice(0, 7)} to ${tip.slice(0, 7)}); ship it again` });
        continue;
      }
      const mb = git(dir, 'merge-base', `origin/${base}`, tip).out.trim();
      const commits = git(dir, 'rev-list', '--reverse', '--no-merges', `${mb}..${tip}`).out.split('\n').filter(Boolean);
      if (!commits.length) {
        out.conflicts.push({ item, reason: `${head} has no commits ahead of ${base}` });
        continue;
      }
      const pick = git(dir, 'cherry-pick', ...commits);
      if (pick.code !== 0) {
        git(dir, 'cherry-pick', '--abort');
        git(dir, 'reset', '--hard', '--quiet', 'HEAD');
        out.conflicts.push({ item, reason: `rebase conflict on ${base}: ${(pick.err || pick.out).trim().split('\n').find((l) => /CONFLICT/.test(l)) ?? 'the change does not apply'}` });
        continue;
      }
      included.push(item);
    }
    out.included = included;
    if (!included.length) return { ...out, status: 'empty' };
    // Final ids: a draft gets the next free number on the merged tree, so no two units compute the same one (K5).
    const assigned = assignIds(dir, { floor: numberFloor(dir, `origin/${base}`) });
    if (assigned.length) {
      git(dir, 'add', '-A');
      const c = git(dir, 'commit', '--quiet', '-m', `chore: assign final ids ${assigned.map((a) => a.to.slice(0, 4)).join(' ')}`);
      if (c.code !== 0) throw new ShipError(`queue: could not commit the assigned ids: ${(c.err || c.out).trim()}`);
      out.ids = assigned.map((a) => `${a.from} -> ${a.to}`);
      log('ids', out.ids.join(', '));
    }
    // The step Checks only (the reviewer and conform passes ran before the change was queued).
    for (const command of new Set(included.map((i) => i.item.check).filter(Boolean))) {
      const r = runCheck(run, dir, command);
      if (r.flaky) {
        out.flaky.push(command);
        log('check', `\`${command}\` failed once and passed on the rerun`);
      }
      if (!r.ok) return { ...out, status: 'red', check: `\`${command}\`: ${r.output}` };
    }
    // CI on the batch, with a failed check rerun once before it counts.
    const pushed = git(dir, 'push', '--quiet', '--no-verify', 'origin', `HEAD:refs/heads/${branch}`);
    if (pushed.code !== 0) throw new ShipError(`queue: push failed: ${pushed.err.trim().split('\n').pop()}`);
    const title = included.length === 1 ? included[0].item.title : `chore: merge ${included.length} queued changes`;
    const body = ['Opened by `go-getter queue run`.', '', ...included.map((i) => `- #${i.item.pr} ${i.item.title}${i.item.unit ? ` (${i.item.unit})` : ''}`)].join('\n');
    const created = gh('pr', 'create', '--base', base, '--head', branch, '--title', title, '--body', body);
    if (created.code !== 0) throw new ShipError(`queue: gh pr create: ${(created.err || created.out).trim()}`);
    const view = gh('pr', 'view', branch, '--json', 'number,url,state');
    pr = JSON.parse(view.out);
    let ci;
    for (let round = 0; ; round++) {
      try {
        ci = await waitForCi({ gh, pr, verb: 'queue', ...ctx.ci, log });
        break;
      } catch (err) {
        if (!(err instanceof ShipError) || err.code !== 1 || !/CI failed/.test(err.message) || round > 0) return { ...out, status: 'red', check: err instanceof ShipError ? err.message.replace(/^queue: /, '').replace(/; the pull request stays open.*$/, '') : String(err.message) };
        log('ci', 'a check failed; rerunning once');
        const runs = JSON.parse(gh('run', 'list', '--branch', branch, '--json', 'databaseId,conclusion').out || '[]');
        for (const r of runs.filter((x) => x.conclusion === 'failure')) gh('run', 'rerun', String(r.databaseId), '--failed');
        out.flaky.push('ci');
      }
    }
    if (ci === 'none' && !ctx.allowNoCi) return { ...out, status: 'red', check: 'no CI checks were reported for the batch' };
    // Green: merge the batch, one squash commit on the default branch.
    gh('pr', 'merge', String(pr.number), '--squash', '--delete-branch');
    const state = JSON.parse(gh('pr', 'view', String(pr.number), '--json', 'state').out).state;
    if (state !== 'MERGED') return { ...out, status: 'red', check: `the batch pull request is ${state}, not merged` };
    return { ...out, status: 'green', batch: pr.url };
  } finally {
    if (pr) {
      const v = gh('pr', 'view', String(pr.number), '--json', 'state');
      if (v.code === 0 && JSON.parse(v.out).state === 'OPEN') gh('pr', 'close', String(pr.number), '--delete-branch');
    }
    git(root, 'worktree', 'remove', '--force', dir);
    rmSync(dir, { recursive: true, force: true });
  }
}

// Integrates `items`: a green batch merges; a red one is bisected until the culprit stands alone. Pushes outcomes onto `outcomes`.
async function integrate(ctx, items, outcomes) {
  if (!items.length) return;
  const r = await tryBatch(ctx, items);
  for (const c of r.conflicts) outcomes.push({ item: c.item, outcome: 'returned', reason: c.reason });
  const rest = r.included ?? [];
  if (r.status === 'green') {
    for (const item of rest) outcomes.push({ item, outcome: 'merged', reason: `merged in ${r.batch}`, flaky: r.flaky, ids: r.ids, batch: r.batch });
    return;
  }
  if (r.status !== 'red') return;
  if (rest.length === 1) {
    outcomes.push({ item: rest[0], outcome: 'returned', reason: `failed ${r.check}`, check: r.check });
    return;
  }
  const mid = Math.floor(rest.length / 2);
  ctx.log('bisect', `${rest.length} changes red (${r.check}); splitting`);
  await integrate(ctx, rest.slice(0, mid), outcomes);
  await integrate(ctx, rest.slice(mid), outcomes);
}

// Whether the repository has GitHub's native merge queue on the default branch (a `merge_queue` rule).
export function nativeQueue(run, root, base) {
  const r = run('gh', ['api', `repos/{owner}/{repo}/rules/branches/${base}`], { cwd: root });
  if (r.code !== 0) return false;
  try {
    return JSON.parse(r.out).some((rule) => rule.type === 'merge_queue');
  } catch {
    return false;
  }
}

// The native queue merges: each change is handed to `gh pr merge --auto` and the result is what the pull request becomes.
async function integrateNative(ctx, items, outcomes) {
  const gh = (...a) => ctx.run('gh', a, { cwd: ctx.root });
  for (const item of items) {
    const n = item.item.pr;
    const q = gh('pr', 'merge', String(n), '--squash', '--auto');
    if (q.code !== 0) {
      outcomes.push({ item, outcome: 'returned', reason: `the native merge queue refused: ${(q.err || q.out).trim().split('\n')[0]}` });
      continue;
    }
    for (let i = 0; ; i++) {
      const state = JSON.parse(gh('pr', 'view', String(n), '--json', 'state').out).state;
      if (state === 'MERGED') {
        outcomes.push({ item, outcome: 'merged', reason: 'merged by the native merge queue' });
        break;
      }
      if (state === 'CLOSED' || i >= ctx.nativePolls) {
        outcomes.push({ item, outcome: 'returned', reason: state === 'CLOSED' ? 'the native merge queue removed it (a check failed)' : 'the native merge queue did not merge it in time', check: 'the native merge queue' });
        break;
      }
      await sleep(ctx.ci.intervalMs ?? 20_000);
    }
  }
}

// `queue run`: takes the runner lease, integrates batches until nothing is queued (one batch with `once`), releases the lease.
// { ok, busy?, merged: [pr], returned: [{ pr, reason }] }. `ci` carries the CI wait options (intervalMs, timeoutMs, noCiGraceMs).
export async function runQueue(root, who, { run = defaultRunner, now = clockNow(), remote, log = () => {}, once = false, ci = {}, allowNoCi = false, native, nativePolls = 120 } = {}) {
  const opts = { remote, now };
  const lock = await acquire(root, who, opts);
  if (!lock.ok) return lock.code === 'busy' ? { ok: true, busy: true, holder: lock.holder, merged: [], returned: [], message: lock.error } : lock;
  const base = defaultBranch(root).name;
  const ctx = { root, run, base, log, now, ci, allowNoCi, seq: 0, nativePolls };
  const useNative = native ?? nativeQueue(run, root, base);
  const merged = [];
  const returned = [];
  try {
    for (;;) {
      const view = readQueue(root, { remote, now });
      // Closed pull requests are dropped, not integrated.
      const outcomes = [];
      const open = [];
      for (const e of view.pending) {
        const v = run('gh', ['pr', 'view', String(e.item.pr), '--json', 'state'], { cwd: root });
        const state = v.code === 0 ? JSON.parse(v.out).state : 'OPEN';
        if (state === 'OPEN') open.push(e);
        else outcomes.push({ item: e, outcome: 'returned', reason: `pull request #${e.item.pr} is ${state}` });
      }
      const batch = useNative ? open : pickBatch(open);
      if (!batch.length && !outcomes.length) break;
      if (batch.length) {
        await acquire(root, who, opts); // renew the lease
        log('batch', batch.map((b) => `#${b.item.pr}`).join(', '));
        await (useNative ? integrateNative : integrate)(ctx, batch, outcomes);
      }
      const rec = await record(root, who, opts, outcomes);
      if (!rec.ok) return { ...rec, merged, returned };
      for (const o of outcomes) (o.outcome === 'merged' ? merged : returned).push(o.outcome === 'merged' ? o.item.item.pr : { pr: o.item.item.pr, reason: o.reason });
      if (once || (!batch.length && !outcomes.length)) break;
      if (useNative) break;
    }
  } finally {
    await releaseRunner(root, who, opts);
  }
  return { ok: true, merged, returned };
}

// ---- ship and the command line

// What `ship` and `queue enqueue` queue for the current branch: its pull request, tip, step Check and the scope of the unit claimed here.
export async function enqueueBranch(root, who, { run = defaultRunner, pr, title, check = null, ...opts } = {}) {
  const git = (...a) => run('git', a, { cwd: root });
  const branch = git('branch', '--show-current').out.trim();
  if (!branch) return fail('no-branch', 'HEAD is detached');
  const sha = git('rev-parse', 'HEAD').out.trim();
  const view = pr ?? JSON.parse(run('gh', ['pr', 'view', branch, '--json', 'number,title'], { cwd: root }).out || 'null');
  const number = typeof view === 'number' ? view : view?.number;
  if (!number) return fail('no-pr', `no pull request for ${branch}; open one with go-getter pr`);
  const here = claimedHere(root);
  const r = await enqueue(root, who, { pr: number, branch, sha, title: title ?? view?.title ?? branch, unit: here[0]?.unit ?? null, scope: here.flatMap((u) => u.scope), check }, opts);
  return r.ok ? { ...r, pr: number, branch } : r;
}

// Waits for the outcome of a queued change: { outcome, reason, ... }. `drive` (optional) is called between polls, to run the queue from
// the waiting process; without it the wait only polls, as a worker or CI job elsewhere calls `queue run`.
export async function waitForMerge(root, entry, { intervalMs = 20_000, timeoutMs = 60 * 60_000, drive, remote, log = () => {}, verb = 'ship', url = '' } = {}) {
  const started = Date.now();
  for (;;) {
    const r = queueResult(root, entry.item.pr, entry.created, { remote });
    if (r) return r;
    if (Date.now() - started >= timeoutMs) throw new ShipError(`${verb}: the queue has not merged #${entry.item.pr} after ${Math.round(timeoutMs / 60_000)} min; it stays queued${url ? `: ${url}` : ''}`, 3);
    log('queue', `#${entry.item.pr} waits for the queue`);
    if (drive) await drive();
    else await sleep(intervalMs);
  }
}

export const formatResult = (r) => (r.outcome === 'merged' ? `#${r.pr} merged: ${r.reason}${r.ids?.length ? `; ids ${r.ids.join(', ')}` : ''}` : `#${r.pr} returned${r.unit ? ` to its claimant (${r.unit})` : ''}: ${r.reason}`);

export function formatStatus(view) {
  const lines = [];
  lines.push(view.lock ? `runner: ${view.lock.holder.kind} ${view.lock.holder.id} until ${view.lock.expires}` : 'runner: none');
  if (!view.pending.length) lines.push('queued: none');
  for (const e of view.pending) lines.push(`queued: #${e.item.pr} ${e.item.branch}${e.item.unit ? ` (${e.item.unit})` : ''}${e.scope.length ? `, scope ${e.scope.join(' ')}` : ', no declared scope'}`);
  for (const d of [...view.done.values()].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5)) lines.push(`done: ${formatResult(d.result)}`);
  return lines.join('\n');
}
