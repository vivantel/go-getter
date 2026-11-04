// Work-coordination K5 (decision 0167 item 4): generated INDEX.md files, unit-scoped draft ids, assigned in sequence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expectedIndexes, indexProblems, assignIds, isDraftId } from '../src/artifact-index.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'compiler/bin/go-getter.mjs');
const cli = (cwd, ...args) => spawnSync('node', [bin, ...args], { cwd, encoding: 'utf8' });

const doc = (id, title, extra = '') => `---\nid: ${id}\ntitle: ${title}\nstatus: active\ndate: 2026-11-04\ntags: [coordination, roadmap]\n---\n\n## Body\n${extra}\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'k5-'));
  for (const t of ['facts', 'decisions', 'guardrails', 'skills']) mkdirSync(path.join(dir, 'docs', t), { recursive: true });
  writeFileSync(path.join(dir, 'docs/facts/0001-first.md'), doc('0001-first', 'First fact'));
  writeFileSync(path.join(dir, 'docs/decisions/0004-chosen.md'), doc('0004-chosen', 'A "quoted", decision'));
  writeFileSync(path.join(dir, 'docs/guardrails/g.md'), doc('g', 'Guard'));
  return dir;
}

const write = (dir) => cli(dir, 'artifacts', 'index');

test('the index of the current tree regenerates byte-identically', () => {
  const r = cli(repo, 'check', 'indexes');
  assert.equal(r.status, 0, r.stderr);
  for (const [rel, content] of Object.entries(expectedIndexes(repo))) assert.equal(readFileSync(path.join(repo, rel), 'utf8'), content, rel);
});

test('index generation is deterministic and quotes titles and tags', () => {
  const dir = project();
  try {
    assert.equal(write(dir).status, 0);
    const first = readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8');
    assert.equal(first, '# Decisions index (CSV)\n\nid,title,tags,status\n0004-chosen,"A ""quoted"", decision","coordination, roadmap",active\n');
    assert.match(write(dir).stdout, /up to date/);
    assert.equal(readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8'), first);
    assert.equal(cli(dir, 'check', 'indexes').status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hand-edited index fails the check, a missing row too, and generating fixes it', () => {
  const dir = project();
  try {
    write(dir);
    const file = path.join(dir, 'docs/facts/INDEX.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('First fact', 'Edited by hand'));
    const r = cli(dir, 'check', 'indexes');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /docs\/facts\/INDEX\.md: differs/);
    write(dir);
    assert.equal(cli(dir, 'check', 'indexes').status, 0);
    writeFileSync(path.join(dir, 'docs/facts/0002-new.md'), doc('0002-new', 'New'));
    assert.match(cli(dir, 'check', 'indexes').stderr, /docs\/facts\/INDEX\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a duplicate number fails the check', () => {
  const dir = project();
  try {
    writeFileSync(path.join(dir, 'docs/facts/0001-other.md'), doc('0001-other', 'Other'));
    write(dir);
    const problems = indexProblems(dir);
    assert.deepEqual(problems, ['docs/facts: number 0001 is used by 0001-first and 0001-other']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two draft ids are assigned distinct numbers in sequence and references are rewritten', () => {
  const dir = project();
  try {
    writeFileSync(path.join(dir, 'docs/decisions/draft-k7-park-asks.md'), doc('draft-k7-park-asks', 'Park asks'));
    writeFileSync(path.join(dir, 'docs/decisions/draft-k3-overlap.md'), doc('draft-k3-overlap', 'Overlap'));
    writeFileSync(path.join(dir, 'docs/facts/draft-k3-evidence.md'), doc('draft-k3-evidence', 'Evidence', 'Governed by draft-k3-overlap and draft-k7-park-asks.'));
    writeFileSync(path.join(dir, 'docs/guardrails/g2.md'), doc('g2', 'G2', 'governed-by: draft-k3-overlap, see draft-k3-overlap-extra.'));
    mkdirSync(path.join(dir, 'docs/plans'));
    writeFileSync(path.join(dir, 'docs/plans/p.md'), 'Refs: draft-k7-park-asks\n');
    assert.ok(isDraftId('draft-k3-overlap'));
    const assigned = assignIds(dir);
    assert.deepEqual(assigned.map((a) => `${a.from}>${a.to}`), [
      'draft-k3-evidence>0002-evidence',
      'draft-k3-overlap>0005-overlap',
      'draft-k7-park-asks>0006-park-asks',
    ]);
    assert.ok(!existsSync(path.join(dir, 'docs/decisions/draft-k3-overlap.md')));
    assert.match(readFileSync(path.join(dir, 'docs/decisions/0005-overlap.md'), 'utf8'), /^id: 0005-overlap$/m);
    const fact = readFileSync(path.join(dir, 'docs/facts/0002-evidence.md'), 'utf8');
    assert.match(fact, /Governed by 0005-overlap and 0006-park-asks\./);
    assert.match(readFileSync(path.join(dir, 'docs/guardrails/g2.md'), 'utf8'), /governed-by: 0005-overlap, see draft-k3-overlap-extra\./);
    assert.equal(readFileSync(path.join(dir, 'docs/plans/p.md'), 'utf8'), 'Refs: 0006-park-asks\n');
    assert.deepEqual(indexProblems(dir), []);
    assert.match(readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8'), /^0006-park-asks,"Park asks"/m);
    assert.deepEqual(assignIds(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('assign through the CLI honours a number already taken on the base ref', () => {
  const dir = project();
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'add', '-A');
    writeFileSync(path.join(dir, 'docs/facts/0009-elsewhere.md'), doc('0009-elsewhere', 'Elsewhere'));
    git('add', '-A');
    git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
    rmSync(path.join(dir, 'docs/facts/0009-elsewhere.md'));
    writeFileSync(path.join(dir, 'docs/facts/draft-u1-mine.md'), doc('draft-u1-mine', 'Mine'));
    const r = cli(dir, 'artifacts', 'assign', '--base', 'main');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /draft-u1-mine -> 0010-mine/);
    assert.equal(cli(dir, 'artifacts', 'bogus').status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
