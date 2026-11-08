import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { loadMeters } from '../src/measure.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const cli = path.resolve(here, '..', 'bin', 'go-getter.mjs');
const reader = path.resolve(here, '..', 'src', 'meters', 'generated-share.mjs');
const env = cleanGitEnv(process.env);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gg = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });

const METERS = ['generated-share-derived', 'generated-share-advisory'];
const guardrail = (id, entries) =>
  `---\nid: ${id}\ntitle: ${id}\nstatus: active\ndate: 2026-11-05\ntags: [guardrail]\n${entries ? `go-getter:\n  enforcement:\n${entries.map((e) => `    - tier: ${e.tier}\n      check: c\n${e.origin ? `      origin: ${e.origin}\n` : ''}`).join('')}` : ''}---\n\nBody.\n`;
const write = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};

// Fixture with known figures: 7 entries (2 derived), 5 live guardrails (2 advisory-only).
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-share-'));
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'docs/guardrails/a.md', guardrail('a', [{ tier: 3, origin: 'derived' }, { tier: 3 }]));
  write(dir, 'docs/guardrails/b.md', guardrail('b', [{ tier: 1 }]));
  write(dir, 'docs/guardrails/c.md', guardrail('c', [{ tier: 1, origin: 'derived' }, { tier: 1, origin: 'authored' }]));
  write(dir, 'docs/guardrails/d.md', guardrail('d', [{ tier: 2 }, { tier: 1 }]));
  write(dir, 'docs/guardrails/e.md', guardrail('e', null));
  // Not part of the denominator: the index and the archive.
  write(dir, 'docs/guardrails/INDEX.md', guardrail('index', [{ tier: 1, origin: 'derived' }]));
  write(dir, 'docs/guardrails/archive/old.md', guardrail('old', [{ tier: 1, origin: 'derived' }, { tier: 1 }]));
    // The meters: the real files, with their command pointed at the reader by absolute path.
  for (const id of METERS) {
    const meter = readFileSync(path.join(repo, `docs/meters/${id}.md`), 'utf8').replace(/^command: node \S+/m, `command: node ${reader}`);
    write(dir, `docs/meters/${id}.md`, meter);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return dir;
}

test('both real meter files are valid and carry the denominator rule verbatim', () => {
  const plan = readFileSync(path.join(repo, 'docs/plans/paper-instruments.md'), 'utf8');
  const rule = /the live top-level `docs\/guardrails\/\*\.md` of the ref it is read on, excluding `archive\/` and `INDEX\.md`/.exec(plan)[0];
  for (const id of METERS) {
    const [m] = loadMeters(repo).filter((x) => x.id === id);
    assert.deepEqual(m.problems, []);
    assert.ok(readFileSync(path.join(repo, m.file), 'utf8').includes(rule));
  }
});

const val = (dir, id, day) => {
  const r = gg(dir, 'measure', 'read', id, '--reader', 'test', '--now', `2026-11-${day}T00:00:00Z`);
  assert.equal(r.status, 0, r.stderr);
  return r;
};

test('readings on a fixture repo give exact fractions and measure series aggregates them', () => {
  const dir = fixture();
  assert.equal(gg(dir, 'measure', 'due', '--now', '2026-11-06T00:00:00Z').stdout.match(/due \(last never\)/g).length, 2);
  // 2 derived of 7 entries; 2 advisory-only of 5 guardrails.
  assert.match(val(dir, 'generated-share-derived', '06').stdout, /generated-share-derived=0\.285714 /);
  assert.match(val(dir, 'generated-share-advisory', '06').stdout, /generated-share-advisory=0\.4 /);
  // Uncommitted guardrail changes nothing; a committed one does: 3 of 8, 3 of 6.
  write(dir, 'docs/guardrails/f.md', guardrail('f', [{ tier: 1, origin: 'derived' }]));
  val(dir, 'generated-share-derived', '07');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'add f');
  val(dir, 'generated-share-derived', '08');
  val(dir, 'generated-share-advisory', '08');
  const d = JSON.parse(gg(dir, 'measure', 'series', 'generated-share-derived', '--json').stdout);
  assert.deepEqual(d.readings.map((x) => x.value), [0.285714, 0.285714, 0.375]);
  assert.deepEqual([d.aggregate.count, d.aggregate.min, d.aggregate.max, d.aggregate.latest], [3, 0.285714, 0.375, 0.375]);
  const a = JSON.parse(gg(dir, 'measure', 'series', 'generated-share-advisory', '--json').stdout);
  assert.deepEqual(a.readings.map((x) => x.value), [0.4, 0.5]);
  assert.match(gg(dir, 'measure', 'series', 'generated-share-advisory').stdout, /generated-share-advisory: 2 readings, .*latest 0\.5\nmin 0\.4, max 0\.5, mean 0\.45/);
  assert.equal(gg(dir, 'measure', 'due', '--now', '2026-11-08T12:00:00Z').stdout.trim(), 'no meter is due');
});

test('the reader counts the ref it is given, and --counts gives the raw figures', () => {
  const dir = fixture();
  const first = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'docs/guardrails/g.md', guardrail('g', [{ tier: 1, origin: 'derived' }]));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'add g');
  const counts = (ref) => JSON.parse(execFileSync(process.execPath, [reader, '--counts', '--ref', ref], { cwd: dir, env, encoding: 'utf8' }));
  assert.deepEqual(counts(first), { derived: 2, entries: 7, advisory: 2, guardrails: 5 });
  assert.deepEqual(counts('HEAD'), { derived: 3, entries: 8, advisory: 3, guardrails: 6 });
});

test('a meter command that fails records nothing', () => {
  const dir = fixture();
  const f = 'docs/meters/generated-share-derived.md';
  write(dir, f, readFileSync(path.join(dir, f), 'utf8').replace(/^command: .*$/m, 'command: node /nonexistent.mjs'));
  const r = gg(dir, 'measure', 'read', 'generated-share-derived');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /command .* failed/);
  assert.match(gg(dir, 'measure', 'series', 'generated-share-derived').stdout, /0 readings/);
});
