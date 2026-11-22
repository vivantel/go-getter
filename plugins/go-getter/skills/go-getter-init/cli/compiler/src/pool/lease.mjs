// A lease is the record that a slot is claimed: <main checkout>/.go-getter/pool/leases/pool-NN.json, JSON with a `version`.
// Written `pending` (pool-NN.pending.json) and then `held` by rename, so a crash leaves nothing or a pending record `doctor` finishes.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LEASE_VERSION = 1;
export const poolRoot = (main) => path.join(main, '.go-getter', 'pool');
export const leaseDir = (main) => path.join(poolRoot(main), 'leases');
export const backupDir = (main) => path.join(poolRoot(main), 'backup');

// The pool directory ignores itself, so it never shows in `git status` whatever the project's ignore rules say.
export function ensurePoolRoot(main) {
  mkdirSync(leaseDir(main), { recursive: true });
  const ignore = path.join(poolRoot(main), '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
}

const held = (main, slot) => path.join(leaseDir(main), `${slot}.json`);
const pending = (main, slot) => path.join(leaseDir(main), `${slot}.pending.json`);

export function readLease(main, slot) {
  try {
    return JSON.parse(readFileSync(held(main, slot), 'utf8'));
  } catch {
    return null;
  }
}

export const hasPending = (main, slot) => existsSync(pending(main, slot));
export const pendingSlots = (main) => (existsSync(leaseDir(main)) ? readdirSync(leaseDir(main)).filter((f) => f.endsWith('.pending.json')).map((f) => f.replace('.pending.json', '')) : []);

export function writeLease(main, slot, record, { env = process.env } = {}) {
  ensurePoolRoot(main);
  writeFileSync(pending(main, slot), JSON.stringify({ version: LEASE_VERSION, ...record, state: 'pending' }, null, 2));
  if (env.GO_GETTER_TEST_MODE === '1' && env.GO_GETTER_POOL_CRASH === 'after-pending') process.exit(99);
  const tmp = `${held(main, slot)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: LEASE_VERSION, ...record, state: 'held' }, null, 2));
  renameSync(tmp, held(main, slot));
  rmSync(pending(main, slot), { force: true });
}

export const dropLease = (main, slot) => rmSync(held(main, slot), { force: true });

// Changes fields of a held lease in place (tmp file and rename, so a reader never sees half a record); false when there is no lease.
export function updateLease(main, slot, patch) {
  const current = readLease(main, slot);
  if (!current) return false;
  const tmp = `${held(main, slot)}.upd-${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...current, ...patch }, null, 2));
  renameSync(tmp, held(main, slot));
  return true;
}
