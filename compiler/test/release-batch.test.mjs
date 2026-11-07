import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCommit, bumpOf, nextVersion, changelogEntry, releaseApprovalId } from '../src/release.mjs';

import { scratch, sh } from './support/release-scratch.mjs';

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

test('a fresh checkout with dev dependencies gets them installed before the layers run', () => {
  const s = scratch();
  const dep = path.join(s.dir, 'other', 'dep');
  mkdirSync(dep);
  writeFileSync(path.join(dep, 'package.json'), `${JSON.stringify({ name: 'dep', version: '1.0.0' })}\n`);
  const pkgFile = path.join(s.dir, 'other', 'package.json');
  writeFileSync(pkgFile, `${JSON.stringify({ ...JSON.parse(readFileSync(pkgFile, 'utf8')), devDependencies: { dep: 'file:./dep' } }, null, 2)}\n`);
  writeFileSync(path.join(s.dir, 'other', '.gitignore'), 'node_modules\n');
  s.merge('fix: a fix that needs a dev tool (#11)');
  assert.equal(s.approve('v0.4.2').code, 0);
  s.setGh({ checks: [{ name: 'ci', bucket: 'pass' }] });
  const r = s.batch();
  assert.equal(r.code, 0, r.err);
  assert.match(r.out + r.err, /dev dependencies are not installed/);
});
