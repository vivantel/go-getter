// T11: ship frees its own merged worktree; plan start --worktree cleans once at the limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseWorktree } from '../src/worktree.mjs';
import { ship } from '../src/ship.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../bin/go-getter.mjs');
const fakeGh = path.join(here, 'support/fake-gh.mjs');
const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ident } }).trim();

// A main checkout with a bare origin; linked worktrees go to the sibling "work-wt" directory.
function scratch(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-release-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  sh(work, 'config', 'user.name', 't');
  sh(work, 'config', 'user.email', 't@t');
  writeFileSync(path.join(work, 'README.md'), 'hello\n');
  sh(work, 'add', '-A');
  sh(work, 'commit', '-qm', 'chore: init');
  sh(work, 'branch', '-M', 'main');
  sh(work, 'push', '-q', '-u', 'origin', 'main');
  sh(work, 'remote', 'set-head', 'origin', '-a');
  const state = path.join(dir, 'gh-state.json');
  const env = { ...process.env, ...ident, PATH: `${bin}:${process.env.PATH}`, GH_FAKE_STATE: state, GO_GETTER_SHIP_NO_CI_GRACE_MS: '0', GO_GETTER_SHIP_GATES: 'off' };
  const wt = (slug) => {
    const p = path.join(dir, 'work-wt', slug);
    sh(work, 'worktree', 'add', '-q', '-b', `feat/${slug}`, p, 'main');
    return p;
  };
  const cliRun = (cwd, ...args) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const setGh = (patch) => writeFileSync(state, JSON.stringify(patch));
  setGh({ deleteRemote: true });
  return { dir, work, remote, wt, cliRun, setGh, state };
}

test('ship removes its own merged worktree, prints the main checkout and keeps the local branch', (t) => {
  const s = scratch(t);
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  const r = s.cliRun(p, 'ship', '--title', 'feat: add a', '--why', 'because', '--allow-no-ci');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, new RegExp(`worktree: removed ${p}; continue in the main checkout ${s.work}`));
  assert.ok(!existsSync(p), 'the worktree is gone');
  assert.match(sh(s.work, 'branch', '--list', 'feat/thing'), /feat\/thing/, 'the local branch stays');
});

test('ship leaves the worktree when the pull request is not merged', (t) => {
  const s = scratch(t);
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  s.setGh({ deleteRemote: true, mergeFails: true });
  const r = s.cliRun(p, 'ship', '--title', 'feat: add a', '--why', 'because', '--allow-no-ci');
  assert.notEqual(r.code, 0);
  assert.ok(existsSync(p), 'the worktree stays');
});

test('releaseWorktree keeps a dirty worktree and ignores the main checkout', (t) => {
  const s = scratch(t);
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  sh(p, 'add', '-A');
  sh(p, 'commit', '-qm', 'feat: a');
  sh(p, 'push', '-q', '-u', 'origin', 'feat/thing');
  sh(s.work, 'push', '-q', 'origin', '--delete', 'feat/thing'); // the merge deleted the remote branch
  writeFileSync(path.join(p, 'dirty.txt'), 'x\n');
  const kept = releaseWorktree(p);
  assert.equal(kept.released, false);
  assert.equal(kept.reason, 'uncommitted changes');
  assert.ok(existsSync(p));
  assert.equal(releaseWorktree(s.work), null, 'the main checkout is not a worktree to release');
  rmSync(path.join(p, 'dirty.txt'));
  const done = releaseWorktree(p);
  assert.equal(done.released, true);
  assert.equal(done.main, s.work);
  assert.ok(!existsSync(p));
});

const PLAN = '# P\n\n### 1 Start me — [ ]\nClass: implement\n';

function startAtLimit(t, { mergeOthers }) {
  const s = scratch(t);
  mkdirSync(path.join(s.work, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(s.work, 'docs/plans/p.md'), PLAN);
  sh(s.work, 'add', '-A');
  sh(s.work, 'commit', '-qm', 'chore: plan');
  sh(s.work, 'push', '-q', 'origin', 'main');
  for (const n of ['one', 'two', 'three']) {
    const p = s.wt(n);
    if (mergeOthers) {
      writeFileSync(path.join(p, `${n}.txt`), n);
      sh(p, 'add', '-A');
      sh(p, 'commit', '-qm', `feat: ${n}`);
      sh(s.work, 'merge', '-q', '--ff-only', `feat/${n}`);
      sh(s.work, 'push', '-q', 'origin', 'main');
    }
  }
  return s;
}

test('plan start --worktree at the limit cleans merged worktrees once, then starts', (t) => {
  const s = startAtLimit(t, { mergeOthers: true });
  const r = s.cliRun(s.work, 'plan', 'start', '1', 'docs/plans/p.md', '--worktree', 'fresh');
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(existsSync(path.join(s.dir, 'work-wt', 'fresh')));
  assert.ok(!existsSync(path.join(s.dir, 'work-wt', 'one')), 'a merged worktree was released');
  assert.match(sh(s.work, 'branch', '--list', 'feat/one'), /feat\/one/, 'its branch is kept');
});

test('plan start --worktree at the limit still refuses when nothing is removable', (t) => {
  const s = startAtLimit(t, { mergeOthers: false });
  const r = s.cliRun(s.work, 'plan', 'start', '1', 'docs/plans/p.md', '--worktree', 'fresh');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /the limit is 3/);
  assert.ok(existsSync(path.join(s.dir, 'work-wt', 'one')));
});

test('release relies on the merged-pull-request check when the remote branch survives the merge', (t) => {
  const s = scratch(t);
  s.setGh({ deleteRemote: false });
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  const r = s.cliRun(p, 'ship', '--title', 'feat: add a', '--why', 'because', '--allow-no-ci');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(sh(s.work, 'ls-remote', 'origin', 'refs/heads/feat/thing'), /feat\/thing/, 'the remote branch is still there');
  assert.ok(!existsSync(p), 'removed because its pull request is merged');
});

test('ship releases only its own worktree, not other removable siblings', (t) => {
  const s = scratch(t);
  const other = s.wt('other');
  writeFileSync(path.join(other, 'o.txt'), 'o');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-qm', 'feat: other');
  sh(s.work, 'merge', '-q', '--ff-only', 'feat/other');
  sh(s.work, 'push', '-q', 'origin', 'main');
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  const r = s.cliRun(p, 'ship', '--title', 'feat: add a', '--why', 'because', '--allow-no-ci');
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(!existsSync(p));
  assert.ok(existsSync(other), 'a merged sibling is left for worktree clean');
});

test('ship from the main checkout releases nothing', (t) => {
  const s = scratch(t);
  sh(s.work, 'switch', '-qc', 'feat/in-main');
  writeFileSync(path.join(s.work, 'a.txt'), 'a\n');
  const r = s.cliRun(s.work, 'ship', '--title', 'feat: add a', '--why', 'because', '--allow-no-ci');
  assert.equal(r.code, 0, r.err + r.out);
  assert.doesNotMatch(r.out, /worktree:/);
  assert.ok(existsSync(s.work));
});

test('a release that fails is logged as not released and ship still succeeds', async (t) => {
  const s = scratch(t);
  const p = s.wt('thing');
  writeFileSync(path.join(p, 'a.txt'), 'a\n');
  const saved = { ...process.env };
  Object.assign(process.env, { PATH: `${path.join(s.dir, 'bin')}:${process.env.PATH}`, GH_FAKE_STATE: s.state, GO_GETTER_SHIP_GATES: 'off', ...ident });
  t.after(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); });
  const logs = [];
  const result = await ship(p, { title: 'feat: add a', why: 'because', allowNoCi: true, noCiGraceMs: 0, intervalMs: 0, release: () => { throw new Error('boom\nmore'); } }, undefined, (step, msg) => logs.push(`${step}: ${msg}`));
  assert.equal(result.merged, true);
  assert.equal(result.release, null);
  assert.ok(logs.includes('worktree: not released: boom'), logs.join('\n'));
  assert.ok(existsSync(p));
});

test('plan start --worktree at the limit survives a worktree directory deleted by hand', (t) => {
  const s = startAtLimit(t, { mergeOthers: false });
  rmSync(path.join(s.dir, 'work-wt', 'one'), { recursive: true, force: true }); // not pruned
  const r = s.cliRun(s.work, 'plan', 'start', '1', 'docs/plans/p.md', '--worktree', 'fresh');
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(existsSync(path.join(s.dir, 'work-wt', 'fresh')));
});

test('a clean that cannot remove a worktree leaves the original limit refusal', (t) => {
  const s = startAtLimit(t, { mergeOthers: true });
  sh(s.work, 'worktree', 'lock', path.join(s.dir, 'work-wt', 'one'));
  sh(s.work, 'worktree', 'lock', path.join(s.dir, 'work-wt', 'two'));
  sh(s.work, 'worktree', 'lock', path.join(s.dir, 'work-wt', 'three'));
  const r = s.cliRun(s.work, 'plan', 'start', '1', 'docs/plans/p.md', '--worktree', 'fresh');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /the limit is 3/);
  assert.ok(existsSync(path.join(s.dir, 'work-wt', 'one')));
});
