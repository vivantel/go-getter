// Preload for the lock race test: widens the two windows the race needs. A stat of the lock returns, then the process waits
// (another waiter can act on the same stale reading); a write of the store waits inside the critical section.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const statSync = fs.statSync;
const renameSync = fs.renameSync;
fs.statSync = function (p, ...rest) {
  const out = statSync.call(this, p, ...rest);
  if (String(p).endsWith('store.lock')) sleep(150);
  return out;
};
fs.renameSync = function (from, to, ...rest) {
  if (String(to).endsWith('approvals.json')) sleep(600);
  return renameSync.call(this, from, to, ...rest);
};
syncBuiltinESMExports();
