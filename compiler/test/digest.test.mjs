// Default-and-log and the digest (roadmap T7, decision 0155): a defaulted answer writes a draft artifact, each trigger stops
// the run with a reason, and the digest lists the five kinds of item from fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseFrontmatter } from '../src/frontmatter.mjs';
import { triggersFor } from '../src/defaults.mjs';
import { buildDigest } from '../src/digest.mjs';
import { tieredPack } from './support/tiered-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input: '' });

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-digest-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\ninterview — i\nroadmap — r\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

const json = (dir, name, value) => {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};

const drafts = (dir) => readdirSync(path.join(dir, 'docs/decisions')).filter((f) => f !== 'INDEX.md');

function defaults(dir, extra = [], pack = tieredPack()) {
  const answers = path.join(dir, 'answers.json');
  return { answers, ...run(['interview', 'next', pack.id, '--pack-file', json(dir, 'pack.json', pack), '--answers', answers, '--defaults', '--project', dir, ...extra]) };
}

test('--defaults takes the recommended answers and writes a draft decision with the reason for each', () => {
  const dir = project();
  try {
    const r = defaults(dir, ['--advanced']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.done, true);
    assert.deepEqual(out.defaulted.map((d) => [d.question, d.value]).slice(0, 2), [['task-isolation', 'worktrees'], ['timeout', '30']]);
    const saved = JSON.parse(readFileSync(r.answers, 'utf8'));
    assert.equal(saved.profile['task-isolation'], 'worktrees');
    assert.equal(saved.answers.timeout, '30');
    const files = drafts(dir);
    assert.equal(files.length, out.defaulted.length);
    const profile = files.find((f) => f.includes('task-isolation'));
    const { data, body } = parseFrontmatter(readFileSync(path.join(dir, 'docs/decisions', profile), 'utf8'));
    assert.equal(data.status, 'draft');
    assert.equal(data['accepted-by'], undefined);
    assert.equal(data['go-getter'].defaulted.option, 'worktrees');
    assert.match(body, /Recommended profile: One checkout per task\./);
    assert.match(body, /Refs: docs\/decisions\/0155/);
    assert.match(readFileSync(path.join(dir, 'docs/decisions/INDEX.md'), 'utf8'), new RegExp(`${data.id},.*,draft`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a trigger stops the run with its reason, logs it, and leaves the later questions unasked', () => {
  const dir = project();
  try {
    const risk = json(dir, 'risk.json', { timeout: { irreversible: 'the timeout cannot be raised once tasks are lost' } });
    const r = defaults(dir, ['--advanced', '--risk', risk]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /stopped at "timeout": hard-to-reverse \(the timeout cannot be raised/);
    const out = JSON.parse(r.stdout);
    assert.equal(out.done, false);
    assert.deepEqual(out.stopped.triggers.map((t) => t.letter), ['a']);
    assert.equal(out.defaulted.length, 1, 'only the profile was defaulted before the stop');
    assert.equal(drafts(dir).length, 1);
    assert.equal(JSON.parse(readFileSync(r.answers, 'utf8')).answers.timeout, undefined);
    assert.match(readFileSync(path.join(dir, '.go-getter/state/digest/stops.jsonl'), 'utf8'), /"question":"timeout"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('each of the four triggers stops with a clear reason', () => {
  const hit = (opts) => triggersFor('q', 'v', opts).map((t) => [t.trigger, t.letter]);
  assert.deepEqual(hit({ risk: { irreversible: true } }), [['hard-to-reverse', 'a']]);
  assert.deepEqual(hit({ risk: { supersedes: 'would supersede 0042' } }), [['changes-committed-decision', 'b']]);
  assert.deepEqual(hit({ committed: { q: 'old' } }), [['changes-committed-decision', 'b']]);
  assert.deepEqual(hit({ committed: { q: 'v' } }), []);
  assert.deepEqual(hit({ risk: { dataClass: true } }), [['data-class-or-security', 'c']]);
  assert.deepEqual(hit({ sensitivePack: true }), [['data-class-or-security', 'c']]);
  assert.deepEqual(hit({ budgetUsd: 5, spentUsd: 5.5 }), [['spend-over-budget', 'd']]);
  assert.deepEqual(hit({ budgetUsd: 5, spentUsd: 4, risk: { costUsd: 2 } }), [['spend-over-budget', 'd']]);
  assert.deepEqual(hit({ budgetUsd: 5, spentUsd: 5 }), [], 'at the budget is not over it');
  assert.deepEqual(hit({}), []);
  assert.match(triggersFor('q', 'v', { budgetUsd: 5, spentUsd: 6 })[0].reason, /\$6 would pass the run budget of \$5/);
});

test('through the CLI, spend over budget and a data-class risk stop the run', () => {
  const dir = project();
  try {
    const spend = defaults(dir, ['--budget', '1', '--spent', '2']);
    assert.equal(spend.status, 3);
    assert.equal(JSON.parse(spend.stdout).stopped.triggers[0].trigger, 'spend-over-budget');
    assert.equal(existsSync(path.join(dir, 'docs/decisions')), false, 'nothing is defaulted once spend is over');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const dir2 = project();
  try {
    const risk = json(dir2, 'risk.json', { 'task-isolation': { dataClass: 'sends repository data to a new provider' } });
    const r = defaults(dir2, ['--risk', risk]);
    assert.equal(r.status, 3);
    assert.equal(JSON.parse(r.stdout).stopped.triggers[0].trigger, 'data-class-or-security');
  } finally {
    rmSync(dir2, { recursive: true, force: true });
  }
});

test('a default that would change an adopted answer stops as a change to a committed decision', () => {
  const dir = project();
  try {
    const pack = json(dir, 'pack.json', tieredPack());
    const seed = json(dir, 'seed.json', { answers: { isolation: 'clone', limit: '2' }, acceptedBy: 'Dana', date: '2026-10-31' });
    const adopt = run(['render-pack', 'tiered', '--pack-file', pack, '--answers', seed, '--project', dir]);
    assert.equal(adopt.status, 0, adopt.stderr);
    const r = defaults(dir);
    assert.equal(r.status, 3);
    const stop = JSON.parse(r.stdout).stopped;
    assert.equal(stop.triggers[0].trigger, 'changes-committed-decision');
    assert.match(stop.triggers[0].reason, /would change the committed answer "clone"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the digest lists defaults, stops, merged PRs, spend and the audit sample since the last digest', () => {
  const dir = project();
  try {
    const since = new Date('2026-11-01T00:00:00.000Z');
    const now = new Date('2026-11-02T12:00:00.000Z');
    const state = path.join(dir, '.go-getter/state');
    mkdirSync(path.join(state, 'digest'), { recursive: true });
    mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
    const draft = (id, at, status = 'draft') => `---\nid: ${id}\ntitle: t\nstatus: ${status}\ndate: 2026-11-01\ntags: [interview]\ngo-getter:\n  defaulted:\n    at: ${at}\n    pack: tiered\n    question: limit\n    option: '3'\n---\n`;
    writeFileSync(path.join(dir, 'docs/decisions/0001-new.md'), draft('0001-new', '2026-11-02T01:00:00.000Z'));
    writeFileSync(path.join(dir, 'docs/decisions/0002-old.md'), draft('0002-old', '2026-10-30T01:00:00.000Z'));
    writeFileSync(path.join(dir, 'docs/decisions/0003-accepted.md'), draft('0003-accepted', '2026-11-02T02:00:00.000Z', 'active'));
    writeFileSync(path.join(state, 'digest/stops.jsonl'), [
      { ts: '2026-11-02T03:00:00.000Z', pack: 'tiered', question: 'cap', triggers: [{ trigger: 'spend-over-budget', reason: 'over' }] },
      { ts: '2026-10-29T03:00:00.000Z', pack: 'tiered', question: 'old', triggers: [] },
    ].map((e) => JSON.stringify(e)).join('\n'));
    writeFileSync(path.join(state, 'telemetry.jsonl'), [
      { ts: '2026-11-02T04:00:00.000Z', event: 'spend', model: 'm1', cost: 1.25 },
      { ts: '2026-11-02T05:00:00.000Z', event: 'spend', model: 'm1', cost: 0.75 },
      { ts: '2026-10-30T05:00:00.000Z', event: 'spend', model: 'm1', cost: 9 },
    ].map((e) => JSON.stringify(e)).join('\n'));
    writeFileSync(path.join(state, 'digest/audit.json'), JSON.stringify({ prs: [7, 9], flagged: [9] }));
    const exec = () => JSON.stringify([
      { number: 7, title: 'feat: a', mergedAt: '2026-11-02T06:00:00.000Z' },
      { number: 3, title: 'old', mergedAt: '2026-10-20T06:00:00.000Z' },
    ]);
    const d = buildDigest(dir, { now, since, exec });
    assert.deepEqual(d.defaults.map((x) => x.id), ['0001-new']);
    assert.deepEqual(d.stops.map((x) => x.question), ['cap']);
    assert.deepEqual(d.mergedPrs, [{ number: 7, title: 'feat: a', mergedAt: '2026-11-02T06:00:00.000Z' }]);
    assert.deepEqual(d.spend, { records: 2, costUsd: 2, byModel: { m1: 2 } });
    assert.deepEqual(d.audit, { prs: [7, 9], flagged: [9] });
    assert.equal(d.since, since.toISOString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('go-getter digest --mark starts the next digest from now', () => {
  const dir = project();
  try {
    const first = run(['digest', '--project', dir, '--mark']);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(Object.keys(JSON.parse(first.stdout)), ['since', 'defaults', 'stops', 'mergedPrs', ...(JSON.parse(first.stdout).prsUnavailable ? ['prsUnavailable'] : []), 'spend', 'audit']);
    assert.ok(existsSync(path.join(dir, '.go-getter/state/digest/last.json')));
    const second = JSON.parse(run(['digest', '--project', dir]).stdout);
    assert.ok(Date.parse(second.since) > Date.now() - 60_000, 'the window starts at the mark');
    assert.equal(run(['digest', '--bogus']).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
