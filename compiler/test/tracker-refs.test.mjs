import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRef, refId } from '../src/trackers/refs.mjs';
import { parsePlan } from '../src/plan.mjs';
import { callSource } from '../src/trackers/worksource.mjs';
import { fileSource } from '../src/trackers/file-source.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

test('GitHub references parse in every written form', () => {
  assert.deepEqual(parseRef('#123'), { tracker: 'github', key: '123', text: '#123' });
  assert.deepEqual(parseRef('vivantel/go-getter#7'), { tracker: 'github', key: '7', text: 'vivantel/go-getter#7', repo: 'vivantel/go-getter' });
  assert.deepEqual(parseRef('https://github.com/vivantel/go-getter/issues/71'), { tracker: 'github', key: '71', text: 'vivantel/go-getter#71', repo: 'vivantel/go-getter' });
  assert.deepEqual(parseRef('  #5 '), { tracker: 'github', key: '5', text: '#5' }, 'surrounding space is ignored');
});

test('Jira references parse as a key or a browse URL, and PROJ-123 is not GitHub', () => {
  assert.deepEqual(parseRef('PROJ-123'), { tracker: 'jira', key: 'PROJ-123', text: 'PROJ-123' });
  assert.deepEqual(parseRef('AB_C2-9'), { tracker: 'jira', key: 'AB_C2-9', text: 'AB_C2-9' });
  assert.deepEqual(parseRef('https://acme.atlassian.net/browse/PROJ-123'), { tracker: 'jira', key: 'PROJ-123', text: 'PROJ-123' });
  assert.deepEqual(parseRef('https://jira.example.com/browse/PROJ-123/'), { tracker: 'jira', key: 'PROJ-123', text: 'PROJ-123' });
});

test('near misses are not references', () => {
  for (const bad of ['PROJ123', '#', '#0', '#012', '#12a', 'repo#1.2', 'repo#1', 'proj-123', 'A-1', 'PROJ-0', 'PROJ-', 'PROJ-1a', '', ' ', '123', 'issue #1',
    'http://github.com/o/r/issues/1', 'https://github.com/o/r/pull/1', 'https://github.com/o/r/issues/1?x=1', 'https://github.com/o/r/issues/1#c', 'https://user@github.com/o/r/issues/1',
    'https://acme.atlassian.net/PROJ-123', 'https://acme.atlassian.net/browse/proj-123', 'https://x/browse/PROJ-1 y', 'ftp://acme.atlassian.net/browse/PROJ-1']) {
    assert.equal(parseRef(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseRef(undefined), null);
  assert.equal(parseRef(12), null);
});

test('the same issue written two ways has one identity; a repository and its absence differ', () => {
  assert.equal(refId(parseRef('o/r#5')), refId(parseRef('https://github.com/o/r/issues/5')));
  assert.notEqual(refId(parseRef('#5')), refId(parseRef('o/r#5')));
  assert.notEqual(refId(parseRef('#5')), refId(parseRef('PROJ-5')));
});

const PLAN = (extra = '') => `# P\n\n### 1 First — [ ]\nClass: implement · Issue: #12\nDone-when: one.\n\n### PROJ-7 Tracker keyed — [ ]\nIssue: PROJ-7\nNeeds: 1\n${extra}`;

test('a plan step may carry Issue, alone or on the metadata line, and a step id may have a hyphen', () => {
  const plan = parsePlan(PLAN(), 'p.md');
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.steps.map((s) => s.id), ['1', 'PROJ-7']);
  assert.equal(plan.steps[0].fields.Issue, '#12');
  assert.equal(plan.steps[1].issueRef.tracker, 'jira');
  assert.deepEqual(plan.steps[1].needs, ['1']);
});

test('a malformed or duplicate Issue is a problem naming the file and line', () => {
  const bad = parsePlan(PLAN('\n### 3 Bad — [ ]\nIssue: PROJ123\n'), 'p.md');
  assert.match(bad.problems[0], /^p\.md:12: step 3 has a malformed Issue "PROJ123"/);
  const dupe = parsePlan(PLAN('\n### 3 Same — [ ]\nIssue: https://github.com/o/r/issues/12\n\n### 4 Same again — [ ]\nIssue: #12\n'), 'p.md');
  assert.match(dupe.problems.join('\n'), /p\.md:14: step 4 names issue #12, already the issue of step 1/);
  assert.equal(parsePlan(PLAN('\n### 3 Other repo — [ ]\nIssue: o/r#12\n'), 'p.md').problems.length, 0, '#12 here and o/r#12 are different references');
});

test('check plans fails on a malformed reference with the file and line', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-refs-'));
  try {
    mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN('\n### 3 Bad — [ ]\nIssue: nope\n'));
    const r = spawnSync(process.execPath, [cli, 'check', 'plans', '--project', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /docs\/plans\/p\.md:12: step 3 has a malformed Issue "nope"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the file source reports a step issue as plain data', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-refs-'));
  try {
    writeFileSync(path.join(dir, 'p.md'), PLAN());
    const r = await callSource(fileSource(path.join(dir, 'p.md')), 'list');
    assert.deepEqual(r.result.steps.map((s) => s.issue), ['#12', 'PROJ-7']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
