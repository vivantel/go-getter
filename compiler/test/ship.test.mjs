import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleFromBranch, buildMessage, ciOutcome, defaultRunner } from '../src/ship.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../bin/go-getter.mjs');
const fakeGh = path.join(here, 'support/fake-gh.mjs');
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

// A scratch project with a bare origin, a pushed default branch and a fake gh first on PATH.
function scratch({ branch = 'feat/add-thing' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-ship-'));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  writeFileSync(path.join(work, 'README.md'), 'hello\n');
  sh(work, 'config', 'user.name', 't');
  sh(work, 'config', 'user.email', 't@t');
  sh(work, 'add', '-A');
  sh(work, 'commit', '-qm', 'chore: init');
  sh(work, 'push', '-q', 'origin', 'HEAD:main');
  sh(work, 'branch', '-M', 'main');
  sh(work, 'push', '-q', '-u', 'origin', 'main');
  sh(work, 'remote', 'set-head', 'origin', '-a');
  sh(work, 'switch', '-qc', branch);
  const state = path.join(dir, 'gh-state.json');
  const verb = (name, ...args) => {
    const r = spawnSync(process.execPath, [cli, name, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_FAKE_STATE: state, GO_GETTER_SHIP_NO_CI_GRACE_MS: '0' } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const ship = (...args) => verb('ship', ...args);
  const pr = (...args) => verb('pr', ...args);
  const gh = () => JSON.parse(readFileSync(state, 'utf8'));
  const setGh = (patch) => writeFileSync(state, JSON.stringify({ ...(existsGh(state) ? gh() : {}), ...patch }));
  return { dir, work, remote, ship, pr, gh, setGh, sh: (...a) => sh(work, ...a) };
}
const existsGh = (f) => { try { readFileSync(f); return true; } catch { return false; } };

test('titleFromBranch, buildMessage and ciOutcome are pure helpers', () => {
  assert.equal(titleFromBranch('feat/add-ship-verb'), 'feat: add ship verb');
  assert.equal(titleFromBranch('main'), null);
  assert.equal(buildMessage({ title: 'fix: x', why: 'because', refs: ['a.md', 'a.md', 'b.md'] }), 'fix: x\n\nbecause\n\nRefs: a.md\nRefs: b.md');
  assert.equal(ciOutcome([]), 'none');
  assert.equal(ciOutcome([{ bucket: 'pass' }, { bucket: 'skipping' }]), 'success');
  assert.equal(ciOutcome([{ bucket: 'pass' }, { bucket: 'pending' }]), 'pending');
  assert.equal(ciOutcome([{ bucket: 'pending' }, { bucket: 'fail' }]), 'failure');
});

test('happy path: commit, push, pull request, green CI, squash merge', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'thing.txt'), 'thing\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pending' }], [{ name: 'ci', bucket: 'pass' }]] });
  const r = s.ship('--why', 'Things need a thing so users can do X.', '--interval', '0');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /ship merge: squashed https:\/\/example.test\/o\/r\/pull\/7/);
  const gh = s.gh();
  assert.equal(gh.pr.title, 'feat: add thing');
  assert.match(gh.pr.body, /## Intent\n\nThings need a thing/);
  assert.deepEqual(gh.merged, { squash: true, deleteBranch: true });
  assert.equal(s.sh('log', '-1', '--format=%s'), 'feat: add thing');
  assert.match(s.sh('log', '-1', '--format=%b'), /Things need a thing/);
  assert.equal(s.sh('ls-remote', 'origin', 'refs/heads/feat/add-thing').split('\t')[1], 'refs/heads/feat/add-thing');
});

test('refuses the default branch, a missing why and nothing to ship', () => {
  const s = scratch();
  assert.match(s.ship('--why', 'x').err, /nothing to ship/);
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  const noWhy = s.ship();
  assert.equal(noWhy.code, 2);
  assert.match(noWhy.err, /say why/);
  s.sh('switch', '-q', 'main');
  const onMain = s.ship('--why', 'x');
  assert.equal(onMain.code, 1);
  assert.match(onMain.err, /default branch/);
});

test('a branch name that is not <type>/<slug> needs --title, and the title must be conventional', () => {
  const s = scratch({ branch: 'wip' });
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  assert.equal(s.ship('--why', 'x').code, 2);
  assert.equal(s.ship('--why', 'x', '--title', 'did stuff').code, 2);
});

test('red CI leaves the pull request open and names the failing check', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  s.setGh({ checks: [[{ name: 'unit', bucket: 'fail' }, { name: 'lint', bucket: 'pass' }]] });
  const r = s.ship('--why', 'because', '--interval', '0');
  assert.equal(r.code, 1);
  assert.match(r.err, /CI failed on unit/);
  assert.equal(s.gh().merged, undefined);
  assert.equal(s.gh().pr.state, 'OPEN');
});

test('no CI checks stop the merge unless allowed', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  const stopped = s.ship('--why', 'because');
  assert.equal(stopped.code, 3);
  assert.match(stopped.err, /no CI checks reported/);
  const allowed = s.ship('--why', 'because', '--allow-no-ci');
  assert.equal(allowed.code, 0, allowed.err);
  assert.equal(s.gh().pr.state, 'MERGED');
});

test('--dry-run writes nothing', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  const dry = s.ship('--why', 'because', '--dry-run');
  assert.equal(dry.code, 0);
  assert.match(dry.out, /nothing written/);
  assert.equal(s.sh('status', '--porcelain'), '?? a.txt');
  assert.equal(s.sh('ls-remote', 'origin', 'refs/heads/feat/add-thing'), '');
  assert.equal(s.ship('--why', 'because', '--no-merge').code, 2, '--no-merge is gone: ship always merges');
});

test('pr opens the pull request, waits for CI and never merges', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pending' }], [{ name: 'ci', bucket: 'pass' }]] });
  const r = s.pr('--why', 'because', '--interval', '0');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /pr ci: 1 check green/);
  assert.match(r.out, /pr: opened https:\/\/example.test\/o\/r\/pull\/7/);
  assert.equal(s.gh().pr.state, 'OPEN');
  assert.equal(s.gh().merged, undefined);
});

test('pr fails on red CI and leaves the pull request open; dry-run previews it', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  const dry = s.pr('--why', 'because', '--dry-run');
  assert.match(dry.out, /would open a pull request for/);
  assert.equal(s.sh('ls-remote', 'origin', 'refs/heads/feat/add-thing'), '');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'fail' }]] });
  const r = s.pr('--why', 'because');
  assert.equal(r.code, 1);
  assert.match(r.err, /^pr: CI failed on ci/m);
  assert.equal(s.gh().pr.state, 'OPEN');
});

test('pr with no CI reports it and succeeds; --allow-no-ci belongs to ship only', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  const r = s.pr('--why', 'because');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /pr ci: no checks reported/);
  assert.equal(s.pr('--allow-no-ci').code, 2);
});

test('already-committed work ships with its own message, and a failed merge is reported', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  s.sh('add', '-A');
  s.sh('commit', '-qm', 'fix: handle a\n\nWithout this a crashes the parser.');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]], mergeFails: true });
  const r = s.ship();
  assert.equal(r.code, 1);
  assert.match(r.err, /not merged/);
  assert.equal(s.gh().pr.title, 'fix: handle a');
  assert.match(s.gh().pr.body, /Without this a crashes the parser/);
});

test('usage errors exit 2', () => {
  const s = scratch();
  assert.equal(s.ship('--bogus').code, 2);
  assert.equal(s.ship('--title').code, 2);
});

test('defaultRunner keeps the command own result when it exits without reading its input, and reports only a missing command as 127', () => {
  const big = 'x'.repeat(4 * 1024 * 1024); // far past the pipe buffer, so writing it to a child that never reads fails with EPIPE
  const r = defaultRunner(process.execPath, ['-e', 'console.log("done"); process.exit(3)'], { cwd: tmpdir(), input: big });
  assert.equal(r.code, 3);
  assert.match(r.out, /done/);
  assert.equal(defaultRunner('gg-no-such-command', [], { cwd: tmpdir() }).code, 127);
});

// A stand-in for the claude CLI that answers with the verdict in CLAUDE_FAKE_VERDICT.
function withFakeClaude(s, verdict) {
  const bin = path.join(s.dir, 'bin');
  writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "looked at the diff"\necho "${verdict}"\n`);
  chmodSync(path.join(bin, 'claude'), 0o755);
}

test('--review stops on a FAIL verdict before anything is committed, and lets a PASS through', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  withFakeClaude(s, 'VERDICT: FAIL breaks decision 0042');
  const failed = s.ship('--why', 'because', '--review');
  assert.equal(failed.code, 1);
  assert.match(failed.err, /review found problems: breaks decision 0042/);
  assert.equal(s.sh('status', '--porcelain'), '?? a.txt');
  withFakeClaude(s, 'VERDICT: PASS small and covered');
  const passed = s.ship('--why', 'because', '--review', '--interval', '0');
  assert.equal(passed.code, 0, passed.err);
  assert.match(passed.out, /ship review: small and covered/);
  assert.match(s.gh().pr.body, /review: small and covered/);
});

test('--review without a verdict line is an error', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  withFakeClaude(s, 'no verdict here');
  const r = s.ship('--why', 'because', '--review');
  assert.equal(r.code, 1);
  assert.match(r.err, /no verdict line/);
});

test('an unreadable CI status (gh failing) is an error even with --allow-no-ci', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  rmSync(path.join(s.dir, 'bin', 'gh')); // a symlink to the shared fake: replace it, never write through it
  writeFileSync(path.join(s.dir, 'bin', 'gh'), `#!/bin/sh\ncase "$*" in *--version*) echo gh;; *"pr create"*) exit 0;; *"pr view"*) echo '{"number":7,"url":"u","state":"OPEN"}';; *"pr checks"*) echo "HTTP 401: bad credentials" >&2; exit 1;; esac\n`, { mode: 0o755 });
  const r = s.ship('--why', 'because', '--allow-no-ci');
  assert.equal(r.code, 1);
  assert.match(r.err, /could not read CI status: HTTP 401/);
});

test('a checkpoint of the uncommitted work is taken before the commit and the push', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'thing.txt'), 'thing\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  const r = s.ship('--why', 'Things need a thing.', '--interval', '0');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /ship checkpoint: refs\/go-getter\/checkpoints\//);
  const refs = s.sh('for-each-ref', '--format=%(refname)', 'refs/go-getter/checkpoints').split('\n').filter(Boolean);
  assert.equal(refs.length, 1);
  // The checkpoint holds the file as it was before ship committed it, and is not on the pushed branch.
  assert.match(s.sh('ls-tree', '--name-only', refs[0]), /thing\.txt/);
  assert.equal(s.sh('ls-remote', 'origin', 'refs/go-getter/checkpoints/*'), '');
});

test('a refused or dry run takes no checkpoint, and a red CI run keeps the one it took', () => {
  const s = scratch();
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  assert.equal(s.ship().code, 2); // no --why
  assert.equal(s.ship('--why', 'x', '--dry-run').code, 0);
  assert.equal(s.sh('for-each-ref', 'refs/go-getter/checkpoints'), '');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'fail' }]] });
  const red = s.ship('--why', 'x', '--interval', '0');
  assert.notEqual(red.code, 0);
  assert.equal(s.sh('for-each-ref', '--format=%(refname)', 'refs/go-getter/checkpoints').split('\n').filter(Boolean).length, 1);
});
