// Warm slots: keeps `warm` free slots ready on the current base, so an acquire finds one at once. A cold slot is created, a free slot
// behind the base is moved to it, and the `warm-command` runs in each slot that was created or refreshed (once per create or refresh,
// never per acquire). Warming never makes a slot cold: `available` only goes down when slots are claimed.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../git-env.mjs';
import { fetchOrigin } from '../worktree.mjs';
import { poolConfig } from './config.mjs';
import { ensurePoolRoot, poolRoot } from './lease.mjs';
import { withLock } from './lock.mjs';
import { baseRef, classify, mainCheckout, slotsRoot } from './state.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();

export function warm(cwd, { log = () => {} } = {}) {
  const main = mainCheckout(cwd);
  const config = poolConfig(main);
  if (config.warm <= 0) return { created: [], refreshed: [], ran: [] };
  fetchOrigin(main); // outside the lock
  return withLock(main, () => {
    const ref = baseRef(main, config);
    const sha = git(main, 'rev-parse', `${ref}^{commit}`);
    const out = { created: [], refreshed: [], ran: [] };
    let free = 0;
    for (let n = 1; n <= config.size && free < config.warm; n++) {
      const s = classify(main, config, n, { base: ref });
      if (s.state === 'free') {
        free++;
        if (git(s.dir, 'rev-parse', 'HEAD') !== sha) {
          git(s.dir, 'checkout', '-q', '--detach', sha);
          out.refreshed.push(s.slot);
          runWarm(s);
        }
      } else if (s.state === 'cold') {
        ensurePoolRoot(main);
        mkdirSync(slotsRoot(main), { recursive: true });
        git(main, 'worktree', 'add', '--detach', s.dir, sha);
        free++;
        out.created.push(s.slot);
        runWarm(s);
      }
    }
    return out;
    function runWarm(s) {
      if (!config.warmCommand) return;
      try {
        execFileSync('sh', ['-c', config.warmCommand], { cwd: s.dir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
        out.ran.push(s.slot);
      } catch (err) {
        log(`warm command failed in ${s.slot}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
      }
    }
  });
}

// Starts a top-up that outlives this process, logging to <pool>/warm.log; returns at once.
export function warmInBackground(cwd, cli) {
  const main = mainCheckout(cwd);
  ensurePoolRoot(main);
  const fd = openSync(path.join(poolRoot(main), 'warm.log'), 'a');
  spawn(process.execPath, [cli, 'pool', 'warm', '--sync'], { cwd, detached: true, stdio: ['ignore', fd, fd] }).unref();
}
