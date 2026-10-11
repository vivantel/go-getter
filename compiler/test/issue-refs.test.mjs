import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suggestRefs } from '../src/refs.mjs';
import commitTrailer from '../src/checks/builtin/commit-trailer.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const env = cleanGitEnv(process.env);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const commit = (dir, message) => git(dir, '-c', 'user.name=t', '-c', 'user.email=[email-2]', 'commit', '-q', '-m', message);
const today = '2026-10-11';

const PLAN = `# Plan

### 1 First — [ ]
Issue: #12
Done-when: one.

### 2 Second — [ ]
Issue: PROJ-7
Done-when: two.

### 3 Third — [ ]
Done-when: three, no issue.
`;

function fixture(branch, plan = PLAN) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-issue-refs-'));
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), plan);
  writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  commit(dir, 'init');
  git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}
const rows = (refs) => ({ must: refs.must.map((r) => `${r.path} — ${r.reason}`), nice: refs.nice.map((r) => `${r.path} — ${r.reason}`) });
const edit = (dir, from, to) => writeFileSync(path.join(dir, 'docs/plans/p.md'), readFileSync(path.join(dir, 'docs/plans/p.md'), 'utf8').replace(from, to));
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('a plan step the diff touches lists its issue as a must-have, once; untouched steps list nothing', () => {
  const dir = fixture('feat/other');
  try {
    edit(dir, '### 1 First — [ ]', '### 1 First — [x]');
    edit(dir, 'Done-when: one.', 'Done-when: one, changed.');
    git(dir, 'add', '-A');
    const got = rows(suggestRefs(dir, { staged: true, today }));
    assert.deepEqual(got.must.filter((m) => m.startsWith('#')), ['#12 — issue of step 1 touched in this diff']);
    assert.ok(!got.must.some((m) => m.includes('PROJ-7')), 'step 2 was not touched');
  } finally {
    cleanup(dir);
  }
});

test('a Jira issue is listed the same way, and a step with no issue adds nothing', () => {
  const dir = fixture('feat/other');
  try {
    edit(dir, 'Done-when: two.', 'Done-when: two, changed.');
    edit(dir, 'Done-when: three, no issue.', 'Done-when: three, changed.');
    git(dir, 'add', '-A');
    const got = rows(suggestRefs(dir, { staged: true, today }));
    assert.deepEqual(got.must.filter((m) => !m.startsWith('docs/')), ['PROJ-7 — issue of step 2 touched in this diff']);
  } finally {
    cleanup(dir);
  }
});

test('writing Issue onto a step lists that issue', () => {
  const dir = fixture('feat/other');
  try {
    edit(dir, '### 3 Third — [ ]\n', '### 3 Third — [ ]\nIssue: owner/repo#40\n');
    git(dir, 'add', '-A');
    assert.ok(rows(suggestRefs(dir, { staged: true, today })).must.includes('owner/repo#40 — issue of step 3 touched in this diff'));
  } finally {
    cleanup(dir);
  }
});

test('an issue the branch slug names is a nice-to-have, in GitHub and Jira form', () => {
  for (const [branch, want] of [['feat/123-add-thing', '#123'], ['fix/123', '#123'], ['feat/PROJ-7-add-thing', 'PROJ-7'], ['feat/proj-7-add-thing', 'PROJ-7']]) {
    const dir = fixture(branch);
    try {
      writeFileSync(path.join(dir, 'a.txt'), 'b\n');
      git(dir, 'add', '-A');
      assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })).nice, [`${want} — branch slug names this issue`], branch);
    } finally {
      cleanup(dir);
    }
  }
});

test('a lower-case key counts only when a plan already names that Jira project; dates and plain words never count', () => {
  for (const branch of ['feat/fix-2-typos', 'feat/2026-10-11-notes', 'feat/add-thing', 'feat/v2-rewrite', 'feat/proj-7-x']) {
    const dir = fixture(branch, '# Plan\n\n### 1 One — [ ]\nDone-when: x.\n');
    try {
      writeFileSync(path.join(dir, 'a.txt'), 'b\n');
      git(dir, 'add', '-A');
      assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })).nice, [], branch);
    } finally {
      cleanup(dir);
    }
  }
});

test('an issue that is both touched and named by the branch appears once, as a must-have', () => {
  const dir = fixture('feat/12-first');
  try {
    edit(dir, '### 1 First — [ ]', '### 1 First — [x]');
    git(dir, 'add', '-A');
    const got = rows(suggestRefs(dir, { staged: true, today }));
    assert.ok(got.must.includes('#12 — issue of step 1 touched in this diff'));
    assert.ok(!got.nice.some((n) => n.startsWith('#12')));
  } finally {
    cleanup(dir);
  }
});

test('the commit-trailer check accepts an issue reference as the Refs value', () => {
  const dir = fixture('feat/x');
  try {
    for (const value of ['#123', 'PROJ-123', 'owner/repo#4', 'docs/decisions/0001-x.md']) {
      writeFileSync(path.join(dir, 'a.txt'), `${value}\n`);
      git(dir, 'add', '-A');
      commit(dir, `feat: change\n\nWhy.\n\nRefs: ${value}`);
    }
    assert.deepEqual(commitTrailer({ project: dir, args: { trailer: 'Refs', base: 'main' } }), { ok: true });
    writeFileSync(path.join(dir, 'a.txt'), 'no trailer\n');
    git(dir, 'add', '-A');
    commit(dir, 'feat: another\n\nWhy, with #123 in prose only.');
    assert.equal(commitTrailer({ project: dir, args: { trailer: 'Refs', base: 'main' } }).ok, false);
  } finally {
    cleanup(dir);
  }
});
