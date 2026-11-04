import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommit, bumpOf, nextVersion, changelogEntry, releaseApprovalId } from '../src/release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../bin/go-getter.mjs');
const fakeGh = path.join(here, 'support/fake-gh.mjs');
const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ident } }).trim();

// A scratch project at tag v0.4.1 with a bare origin, a fake gh first on PATH and package scripts standing in for the three layers:
// a layer fails while a file named FAIL_<layer> exists; `build` copies package.json's version into manifest.json.
function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-release-'));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  const scripts = { build: 'node tools.mjs build', test: 'node tools.mjs test', 'check:generated': 'node tools.mjs generated', 'check:versions': 'node tools.mjs versions', eval: 'node tools.mjs eval' };
  writeFileSync(path.join(work, 'package.json'), `${JSON.stringify({ name: 'demo', version: '0.4.1', scripts }, null, 2)}\n`);
  writeFileSync(path.join(work, 'manifest.json'), `${JSON.stringify({ version: '0.4.1' })}\n`);
  writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n\n## [0.4.1] - 2026-10-31\n\n### Fixed\n\n- an old fix\n');
  writeFileSync(path.join(work, 'tools.mjs'), `
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [, , what] = process.argv;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (what === 'build') { writeFileSync('manifest.json', JSON.stringify({ version }) + '\\n'); process.exit(0); }
if (what === 'versions' && JSON.parse(readFileSync('manifest.json', 'utf8')).version !== version) { console.error('manifest disagrees'); process.exit(1); }
if (existsSync('FAIL_' + what)) { console.error(what + ' failed'); process.exit(1); }
`);
  sh(work, 'config', 'user.name', 't');
  sh(work, 'config', 'user.email', 't@t');
  sh(work, 'add', '-A');
  sh(work, 'commit', '-qm', 'chore: init');
  sh(work, 'branch', '-M', 'main');
  sh(work, 'tag', 'v0.4.1');
  sh(work, 'push', '-q', '-u', 'origin', 'main', '--tags');
  sh(work, 'remote', 'set-head', 'origin', '-a');
  const state = path.join(dir, 'gh-state.json');
  const home = path.join(dir, 'home');
  const run = (args, extra = {}) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, ...ident, PATH: `${bin}:${process.env.PATH}`, GH_FAKE_STATE: state, GO_GETTER_HOME: home, GO_GETTER_SHIP_NO_CI_GRACE_MS: '0', ...extra } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  // A change merged to main: committed on a second clone and pushed, as a squash merge would land it.
  const other = path.join(dir, 'other');
  sh(dir, 'clone', '-q', remote, other);
  sh(other, 'config', 'user.name', 't');
  sh(other, 'config', 'user.email', 't@t');
  let n = 0;
  const merge = (subject, body = '', file = `change-${++n}.txt`) => {
    writeFileSync(path.join(other, file), `${subject}\n`);
    sh(other, 'add', '-A');
    sh(other, 'commit', '-qm', body ? `${subject}\n\n${body}` : subject);
    sh(other, 'push', '-q', 'origin', 'HEAD:main');
  };
  const gh = () => JSON.parse(readFileSync(state, 'utf8'));
  const setGh = (patch) => writeFileSync(state, JSON.stringify({ ...(existsSync(state) ? gh() : {}), ...patch }));
  const batch = (...a) => run(['release', '--batch', ...a]);
  const approve = (v) => run(['approvals', 'release', v]);
  return { dir, work, remote, merge, batch, approve, run, gh, setGh, sh: (...a) => sh(work, ...a) };
}

test('the bump comes from the Conventional Commit types', () => {
  const c = (s, b) => parseCommit('x', s, b);
  assert.equal(c('not conventional'), null);
  assert.equal(bumpOf([c('docs: a'), c('chore: b'), c('ci: c')], '1.2.3'), null);
  assert.equal(bumpOf([c('docs: a'), c('fix(x): b')], '1.2.3'), 'patch');
  assert.equal(bumpOf([c('fix: a'), c('feat(y): b'), c('docs: c')], '1.2.3'), 'minor');
  assert.equal(bumpOf([c('feat: a'), c('refactor!: b')], '1.2.3'), 'major');
  assert.equal(bumpOf([c('fix: a', 'BREAKING CHANGE: gone')], '1.2.3'), 'major');
  assert.equal(bumpOf([c('feat!: a')], '0.4.1'), 'minor', 'before 1.0.0 a breaking change raises the minor');
  assert.equal(bumpOf([c('chore(release): v1.0.0'), c('docs: a')], '1.0.0'), null, 'a release commit is not a change');
  assert.equal(nextVersion('0.4.1', 'patch'), '0.4.2');
  assert.equal(nextVersion('0.4.1', 'minor'), '0.5.0');
  assert.equal(nextVersion('1.4.1', 'major'), '2.0.0');
  const sha = 'a'.repeat(40);
  assert.equal(releaseApprovalId('1.2.3', sha), `release:v1.2.3@${sha}`);
  assert.equal(releaseApprovalId('v1.2', sha), null);
  assert.equal(releaseApprovalId('1.2.3', 'abc'), null);
  const entry = changelogEntry('0.5.0', '2026-11-04', [c('feat(plugin): pin it'), c('fix: stop it'), c('docs: words'), c('perf: faster')]);
  assert.equal(entry, '## [0.5.0] - 2026-11-04\n\n### Added\n\n- plugin: pin it\n\n### Fixed\n\n- stop it\n\n### Changed\n\n- faster\n');
});

test('the dry run reports the bump derived from the merged commits and writes nothing', () => {
  const s = scratch();
  s.merge('fix: repair the thing (#11)');
  s.merge('feat(cli): add the verb (#12)');
  s.merge('docs: explain it (#13)');
  const r = s.batch('--dry-run');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /3 changes since v0\.4\.1: minor bump, 0\.4\.1 -> 0\.5\.0/);
  const head = sh(s.work, 'rev-parse', 'origin/main');
  assert.match(r.out, new RegExp(`go-getter approvals release v0\\.5\\.0 ${head}`));
  assert.equal(s.sh('status', '--porcelain'), '');
  assert.equal(existsSync(path.join(s.dir, 'gh-state.json')) ? s.gh().calls.some((c) => c[0] === 'pr' && c[1] === 'create') : false, false);
});

test('without a recorded approval it refuses before writing or sending anything', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  const r = s.batch();
  assert.equal(r.code, 2);
  assert.match(r.err, /v0\.5\.0 at main \w+ is not approved/);
  assert.match(r.err, /go-getter approvals release v0\.5\.0/);
  assert.equal(s.sh('branch', '--list', 'chore/release-*'), '');
  assert.equal(s.sh('status', '--porcelain'), '');
  assert.equal(s.sh('ls-remote', '--heads', 'origin', 'chore/release-0.5.0'), '');
  // An approval for another version does not count.
  assert.equal(s.approve('v0.4.2').code, 0);
  assert.equal(s.batch().code, 2);
});

test('an approval for an old head is refused after a new commit lands; the matching head passes; a wrong version is refused', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  assert.equal(s.approve('v0.5.0').code, 0);
  const old = sh(s.work, 'rev-parse', 'origin/main');
  s.merge('fix: a late change (#15)');
  s.sh('fetch', 'origin');
  const head = s.sh('rev-parse', 'origin/main');
  const r = s.batch();
  assert.equal(r.code, 2);
  assert.ok(r.err.includes(old) && r.err.includes(head), 'names both shas');
  assert.ok(r.err.includes(`go-getter approvals release v0.5.0 ${head}`), 're-approve command');
  assert.equal(s.sh('branch', '--list', 'chore/release-*'), '');
  // A sha that is not the head is not recorded.
  assert.equal(s.run(['approvals', 'release', 'v0.5.0', old]).code, 1);
  // The matching head passes.
  assert.equal(s.run(['approvals', 'release', 'v0.5.0', head]).code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  assert.equal(s.batch().code, 0);
  // A wrong version never matches.
  const t = scratch();
  t.merge('feat: add the verb (#12)');
  assert.equal(t.approve('v0.4.2').code, 0);
  const w = t.batch();
  assert.equal(w.code, 2);
  assert.match(w.err, /v0\.5\.0 at main .* is not approved/);
});

test('a failing verification layer refuses the release and leaves nothing pushed or opened', () => {
  for (const layer of ['test', 'generated', 'eval']) {
    const s = scratch();
    s.merge('fix: repair the thing (#11)');
    s.merge('fix: another (#14)', '', `FAIL_${layer}`);
    assert.equal(s.approve('v0.4.2').code, 0);
    const r = s.batch();
    assert.equal(r.code, 1, `${layer}: ${r.err}`);
    assert.match(r.err, /verification layer .* failed/);
    assert.match(r.err, /nothing was pushed/);
    assert.equal(s.sh('ls-remote', '--heads', 'origin', 'chore/release-0.4.2'), '');
    assert.equal(existsSync(path.join(s.dir, 'gh-state.json')) && (s.gh().calls ?? []).some((c) => c[0] === 'pr' && c[1] === 'create'), false);
    assert.equal(s.sh('status', '--porcelain'), '');
    assert.equal(s.sh('branch', '--list', 'chore/release-*'), '');
    assert.equal(s.sh('branch', '--show-current'), 'main');
  }
});

test('one release pull request covers several merged changes and merges once, after approval', () => {
  const s = scratch();
  s.merge('fix: repair the thing (#11)');
  s.merge('feat(cli): add the verb (#12)');
  s.merge('docs: explain it (#13)');
  assert.equal(s.approve('v0.5.0').code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  const r = s.batch();
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /release merge: squashed/);
  const gh = s.gh();
  const creates = gh.calls.filter((c) => c[0] === 'pr' && c[1] === 'create');
  assert.equal(creates.length, 1, 'one release pull request');
  assert.equal(gh.calls.filter((c) => c[0] === 'pr' && c[1] === 'merge').length, 1, 'merged once');
  assert.deepEqual(gh.merged, { squash: true, deleteBranch: true });
  assert.equal(gh.pr.title, 'chore(release): v0.5.0');
  assert.equal(gh.pr.head, 'chore/release-0.5.0');
  for (const subject of ['fix: repair the thing (#11)', 'feat(cli): add the verb (#12)', 'docs: explain it (#13)']) assert.ok(gh.pr.body.includes(subject), `body lists ${subject}`);
  assert.match(gh.pr.body, /unit tests: npm run test passed/);
  assert.match(gh.pr.body, /behavior evals: npm run eval passed/);
  // The pushed release commit carries the changelog entry and the version files.
  const files = (f) => sh(s.work, 'show', `origin/chore/release-0.5.0:${f}`);
  assert.equal(JSON.parse(files('package.json')).version, '0.5.0');
  assert.equal(JSON.parse(files('manifest.json')).version, '0.5.0');
  const changelog = files('CHANGELOG.md');
  assert.match(changelog, /^# Changelog\n\n## \[0\.5\.0\] - \d{4}-\d\d-\d\d\n\n### Added\n\n- cli: add the verb \(#12\)\n\n### Fixed\n\n- repair the thing \(#11\)\n\n## \[0\.4\.1\]/);
  assert.equal(sh(s.work, 'log', '-1', '--format=%s', 'origin/chore/release-0.5.0'), 'chore(release): v0.5.0');
  // It stops at the merge: no tag is created.
  assert.equal(s.sh('tag', '--list', 'v0.5.0'), '');
  assert.match(r.out, /tagging v0\.5\.0/);
});

test('red CI leaves the release pull request open and unmerged', () => {
  const s = scratch();
  s.merge('feat: add the verb (#12)');
  assert.equal(s.approve('v0.5.0').code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'fail' }] });
  const r = s.batch();
  assert.equal(r.code, 1);
  assert.match(r.err, /CI failed on ci/);
  assert.equal(s.gh().calls.filter((c) => c[0] === 'pr' && c[1] === 'merge').length, 0);
});

test('nothing releasable merged since the tag refuses', () => {
  const s = scratch();
  s.merge('docs: only words (#13)');
  const r = s.batch('--dry-run');
  assert.equal(r.code, 1);
  assert.match(r.err, /nothing to release/);
});

test('it needs --batch', () => {
  const s = scratch();
  assert.equal(s.run(['release']).code, 2);
});
