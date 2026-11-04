// Order and limits for `work next` (decision 0174 items 1 and 2): priority inherited from the parent, then the longest chain of
// units that wait on a unit (the critical path), then age; a worker takes one of the first `k` by a hash of its id; a worker and a
// feature each have a limit on live claims. Pure: no I/O besides `flowSettings`' read of the adopted pack answers.
import { createHash } from 'node:crypto';
import { orchestrationData } from './ops.mjs';

export const FLOW_DEFAULTS = { pickAmong: 5, maxConcurrent: 3 };

const positive = (v) => (/^[1-9][0-9]*$/.test(String(v ?? '').trim()) ? Number(v) : null);

// { pickAmong, wipPerWorker, wipPerFeature } from the pack answers (`go-getter` data of the adopted orchestration decisions).
// `wip-per-worker` is a number or `max-concurrent` (the default); `wip-per-feature` is a number or `none` (the default, no limit).
export function flowConfig(data = {}) {
  return {
    pickAmong: positive(data['pick-among']) ?? FLOW_DEFAULTS.pickAmong,
    wipPerWorker: positive(data['wip-per-worker']) ?? positive(data['max-concurrent']) ?? FLOW_DEFAULTS.maxConcurrent,
    wipPerFeature: positive(data['wip-per-feature']),
  };
}
export const flowSettings = (root) => flowConfig(orchestrationData(root));

// The priority of `unit`: its own `Priority` when it sets one, else its parent's, else 0.
export function effectivePriority(unit, resolveParent) {
  const seen = new Set();
  for (let u = unit; u && !seen.has(u); u = resolveParent(u)) {
    seen.add(u);
    if (u.fields?.Priority !== undefined && Number.isInteger(u.priority)) return u.priority;
  }
  return 0;
}

// For each unit id, the length of the longest chain of open units that need it, directly or through others (0 when none).
// `needs` maps unit id -> the unit ids it needs; only ids in `open` count. A cycle is cut where it closes.
export function chainLengths(needs, open) {
  const dependents = new Map();
  for (const [id, list] of needs) {
    if (!open.has(id)) continue;
    for (const n of list) dependents.set(n, [...(dependents.get(n) ?? []), id]);
  }
  const memo = new Map();
  const visit = (id, trail) => {
    if (memo.has(id)) return memo.get(id);
    if (trail.has(id)) return 0;
    trail.add(id);
    const len = Math.max(0, ...(dependents.get(id) ?? []).map((d) => 1 + visit(d, trail)));
    trail.delete(id);
    memo.set(id, len);
    return len;
  };
  return new Map([...open].map((id) => [id, visit(id, new Set())]));
}

// Highest priority first, then the longer dependent chain, then the older (lower `age`).
export const byPriority = (a, b) => b.priority - a.priority || b.chain - a.chain || a.age - b.age;

// Which of `list` (already ordered) a worker takes first: among the first `k`, the one a hash of the worker id picks. The worker's
// choice is stable, and workers with different ids spread over the k units. Returns the list with that unit moved to the front.
export function pickAmong(list, workerId, k) {
  const n = Math.min(Math.max(1, k), list.length);
  if (!workerId || n < 2) return list;
  const at = createHash('sha256').update(String(workerId)).digest().readUInt32BE(0) % n;
  return [list[at], ...list.filter((_, i) => i !== at)];
}
