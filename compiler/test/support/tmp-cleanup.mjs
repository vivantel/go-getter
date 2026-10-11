// Preloaded into every test process (`node --import`): removes the temporary directories the process made under the system
// temporary directory, so a full run no longer leaves thousands of `gg-*` fixtures behind (they filled a 3.8GB tmpfs and failed
// unrelated tests). It wraps `mkdtempSync` and `mkdtemp`, remembers each directory whose name starts with `gg-`, and removes
// them when the process exits. A directory a test already removed is skipped.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const made = new Set();
const tracked = (dir) => {
  const root = os.tmpdir();
  if (typeof dir === 'string' && path.dirname(dir) === root && path.basename(dir).startsWith('gg-')) made.add(dir);
  return dir;
};

const mkdtempSync = fs.mkdtempSync;
fs.mkdtempSync = (...args) => tracked(mkdtempSync(...args));
const mkdtemp = fs.mkdtemp;
fs.mkdtemp = (prefix, options, callback) => {
  const done = typeof options === 'function' ? options : callback;
  return mkdtemp(prefix, typeof options === 'function' ? undefined : options, (err, dir) => done(err, err ? dir : tracked(dir)));
};
syncBuiltinESMExports();

process.on('exit', () => {
  for (const dir of made) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort: a fixture another process is still using is left for the next sweep
    }
  }
});
