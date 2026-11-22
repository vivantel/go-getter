// A throwaway repository for the worktree-pool tests (plan docs/plans/worktree-pool.md, WP1): a bare origin, a clone as the main
// checkout, slots beside it as `<main>-wt/pool-NN`, and a fake `gh` first on PATH. Nothing here touches a real repository or a real pool.
//
// Contract the pool code (WP2 onward) must meet, because the tests stage state through it:
//   - lease records are `<main>/.go-getter/pool/leases/pool-NN.json` (JSON with a `version`);
//   - pool settings can be forced in tests by GO_GETTER_POOL_CONFIG (a JSON object, honoured only with GO_GETTER_TEST_MODE=1);
//   - the clock follows GO_GETTER_CLOCK_OFFSET_MS (honoured only with GO_GETTER_TEST_MODE=1), as `work/ops.mjs` does.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', '..', 'bin', 'go-getter.mjs');
const fakeGh = path.resolve(here, '..', 'support', 'fake-gh-pool.mjs');
const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const pad = (n) => String(n).padStart(2, '0');

// The fixture refuses to run unless its root is a fresh directory under the system temp directory and no directory above it holds a pool.
export function assertThrowawayRoot(dir) {
  const real = realpathSync(dir);
  const tmp = realpathSync(tmpdir());
  if (!real.startsWith(tmp + path.sep) || !path.basename(real).startsWith('gg-')) throw new Error(`pool fixture: ${real} is not a throwaway directory under ${tmp}`);
  for (let d = path.dirname(real); d !== path.dirname(d); d = path.dirname(d)) {
    if (existsSync(path.join(d, '.go-getter', 'pool'))) throw new Error(`pool fixture: ${d} already holds a pool`);
  }
}

export function poolFixture({ config = {}, base = 'main' } = {}) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-pool-')));
  assertThrowawayRoot(parent);
  const origin = path.join(parent, 'origin.git');
  const main = path.join(parent, 'app');
  const slots = `${main}-wt`;
  const bin = path.join(parent, 'bin');
  const ghState = path.join(parent, 'gh-state.json');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  writeFileSync(ghState, JSON.stringify({ prs: [] }));

  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ident } }).trim();
  git(parent, 'init', '-q', '--bare', '-b', base, origin);
  git(parent, 'clone', '-q', origin, main);
  git(main, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(main, 'README.md'), 'hello\n');
  writeFileSync(path.join(main, '.gitignore'), 'node_modules/\n.go-getter/pool/\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-qm', 'chore: init');
  git(main, 'branch', '-M', base);
  git(main, 'push', '-q', '-u', 'origin', base);
  git(main, 'remote', 'set-head', 'origin', '-a');

  const slot = (n) => path.join(slots, `pool-${pad(n)}`);
  const fx = {
    parent, origin, main, slots, base, git, slot,
    leaseFile: (n) => path.join(main, '.go-getter', 'pool', 'leases', `pool-${pad(n)}.json`),
    // A clean, detached slot on the base: the "free" state, made without the pool code.
    freeSlot(n) {
      mkdirSync(slots, { recursive: true });
      git(main, 'worktree', 'add', '-q', '--detach', slot(n), `origin/${base}`);
      return slot(n);
    },
    write(cwd, file, content = 'x\n') {
      mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      writeFileSync(path.join(cwd, file), content);
    },
    commit(cwd, file, content, msg = 'feat: change') {
      fx.write(cwd, file, content);
      git(cwd, 'add', '-A');
      git(cwd, 'commit', '-qm', msg);
      return git(cwd, 'rev-parse', 'HEAD');
    },
    // Land `branch` on origin's base as one squash commit under a different hash, as a squash merge does, and leave the branch behind.
    squashOntoBase(branch) {
      const w = path.join(parent, `land-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      git(main, 'worktree', 'add', '-q', '--detach', w, `origin/${base}`);
      git(w, 'merge', '--squash', branch);
      git(w, 'commit', '-qm', `squash ${branch}`);
      git(w, 'push', '-q', 'origin', `HEAD:${base}`);
      git(main, 'worktree', 'remove', '--force', w);
      git(main, 'fetch', '-q', 'origin');
    },
    setPrs(prs) { writeFileSync(ghState, JSON.stringify({ prs })); },
    writeLease(n, record) {
      mkdirSync(path.dirname(fx.leaseFile(n)), { recursive: true });
      writeFileSync(fx.leaseFile(n), JSON.stringify({ version: 1, state: 'held', base: git(main, 'rev-parse', `origin/${base}`), claimedAt: new Date(Date.now() - 3600e3).toISOString(), ...record }, null, 2));
    },
    readLease: (n) => (existsSync(fx.leaseFile(n)) ? JSON.parse(readFileSync(fx.leaseFile(n), 'utf8')) : null),
    // Runs `go-getter <args>` in `cwd` (default: the main checkout) with the fake gh, test mode and the pool settings forced.
    run(args, { cwd = main, env = {}, input } = {}) {
      const r = spawnSync(process.execPath, [cli, ...args], {
        cwd, encoding: 'utf8', ...(input !== undefined && { input }),
        env: { ...process.env, ...ident, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GH_FAKE_STATE: ghState, GO_GETTER_TEST_MODE: '1', GO_GETTER_POOL_CONFIG: JSON.stringify({ size: 3, base, claimGraceSeconds: 600, sessionTtlSeconds: 43200, ...config }), ...env },
      });
      return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
    },
    pool: (verb, ...a) => fx.run(['pool', verb, ...a]),
    cleanup() { rmSync(parent, { recursive: true, force: true }); },
  };
  return fx;
}
