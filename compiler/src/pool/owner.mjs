// Who holds a slot, and are they alive? Liveness reuses the work-claim machinery (decision 0166), not a second mechanism: the
// worker id is `identity()`, the lease length per worker kind is the claim lease (`claimSettings`), the heartbeat is renewed by the
// same trigger (every go-getter verb), and the worker's own claims in the local record count as heartbeats too. Nothing here calls
// the network: only the lease file and the local claims record are read.
import { readRecord } from '../work/ledger.mjs';
import { claimSettings, clockNow } from '../work/ops.mjs';

// The last sign of life of the lease's owner, in ms: the newest of the claim time, the lease's own heartbeat and the last renewal of
// any work claim that worker holds.
export function lastBeat(main, lease) {
  const beats = [Date.parse(lease.claimedAt), Date.parse(lease.heartbeatAt)];
  for (const c of Object.values(readRecord(main).claims ?? {})) {
    if (lease.worker && c.worker?.id === lease.worker) beats.push(Date.parse(c.expires) - (c.leaseMs ?? 0));
  }
  return Math.max(...beats.filter(Number.isFinite));
}

// { state: 'live' | 'lapsed', ageSeconds, note? }. `live` while the last beat is inside the lease of the worker's kind (plus the clock margin).
export function ownerOf(main, lease, { now = clockNow(), settings = claimSettings(main) } = {}) {
  const kind = lease.workerKind ?? 'agent';
  const window = (settings.leaseMs[kind] ?? settings.leaseMs.agent) + settings.skewMs;
  const age = Math.max(0, now.getTime() - lastBeat(main, lease));
  const owner = { state: age < window ? 'live' : 'lapsed', ageSeconds: Math.round(age / 1000) };
  if (!lease.session) owner.note = 'no session id recorded; only the session ttl applies';
  return owner;
}
