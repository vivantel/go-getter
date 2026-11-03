// The gate stack and the audit picker (roadmap T8, decision 0158): ship refuses to merge when any gate fails, the reviewer gets
// no author transcript, the picker includes every flagged PR and a seeded sample, and a failed audit creates a follow-up stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ship, ShipError } from '../src/ship.mjs';
import { pickAudit, auditPick, auditFail, flaggedPrs } from '../src/audit.mjs';
import { startRun, activeRun } from '../src/runs/record.mjs';
import { parseFrontmatter } from '../src/frontmatter.mjs';
import { buildDigest } from '../src/digest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../bin/go-getter.mjs');
const fakeGh = path.join(here, 'support/fake-gh.mjs');
const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ident } }).trim();

// A scratch project with a bare origin and the fake gh first on PATH (process-wide, restored by the test runner's exit).
function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-stack-'));
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
  sh(work, 'switch', '-qc', 'feat/add-thing');
  writeFileSync(path.join(work, 'thing.txt'), 'thing\n');
  const state = path.join(dir, 'gh-state.json');
  process.env.PATH = `${bin}:${process.env.PATH.split(':').filter((p) => p !== bin).join(':')}`;
  process.env.GH_FAKE_STATE = state;
  process.env.GO_GETTER_HOME = path.join(dir, 'home');
  const gh = () => JSON.parse(readFileSync(state, 'utf8'));
  return { work, gh, setGh: (v) => writeFileSync(state, JSON.stringify(v)) };
}

const base = { why: 'Things need a thing so users can do X.', intervalMs: 0, noCiGraceMs: 0 };
const pass = (summary = 'ok', extra = {}) => async () => ({ ok: true, summary, ...extra });

test('ship runs check, conform, reviewer, then CI in order, and records each result in the run record', async () => {
  const s = scratch();
  const order = [];
  startRun(s.work, { plan: 'throughput', steps: ['T8'] });
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  const log = (step) => order.push(step);
  const r = await ship(s.work, {
    ...base,
    check: 'true',
    conform: async (i) => (order.push('conform-input'), { ok: true, summary: 'conforms' }),
    review: async (i) => (order.push('review-input'), { ok: true, summary: 'clean' }),
  }, undefined, log);
  assert.equal(r.merged, true);
  assert.deepEqual(order.filter((x) => ['check', 'conform-input', 'conform', 'review-input', 'review', 'ci', 'merge'].includes(x)), ['check', 'conform-input', 'conform', 'review-input', 'review', 'ci', 'merge']);
  assert.deepEqual(activeRun(s.work).gates.map((g) => [g.gate, g.status]), [['check', 'pass'], ['conform', 'pass'], ['review', 'pass'], ['ci', 'pass']]);
  assert.match(s.gh().pr.body, /conform: conforms/);
});

test('ship refuses to merge when any gate fails, and later gates do not run', async () => {
  for (const failing of ['check', 'conform', 'review', 'ci']) {
    const s = scratch();
    const ran = [];
    s.setGh({ checks: [[{ name: 'ci', bucket: failing === 'ci' ? 'fail' : 'pass' }]] });
    const opts = {
      ...base,
      check: failing === 'check' ? 'exit 3' : 'true',
      conform: async () => (ran.push('conform'), failing === 'conform' ? { ok: false, summary: 'breaks 0042' } : { ok: true, summary: 'ok' }),
      review: async () => (ran.push('review'), failing === 'review' ? { ok: false, summary: 'bug' } : { ok: true, summary: 'ok' }),
    };
    await assert.rejects(ship(s.work, opts), (e) => e instanceof ShipError && /failed|found problems/.test(e.message), failing);
    assert.equal(s.gh().merged, undefined, `${failing}: merged`);
    if (failing === 'check') assert.deepEqual(ran, []);
    if (failing === 'conform') assert.deepEqual(ran, ['conform']);
    if (failing !== 'ci') assert.equal(s.gh().pr, undefined, `${failing}: no pull request is opened`);
  }
});

test('the reviewer pass receives only the diff, the brief and the decisions, never an author transcript', async () => {
  const s = scratch();
  mkdirSync(path.join(s.work, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(s.work, 'docs/decisions/0001-x.md'), '---\nid: 0001-x\n---\nDecide x.\n');
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  let seen;
  await ship(s.work, { ...base, transcript: 'AUTHOR SECRET THOUGHTS', review: async (...args) => ((seen = args), { ok: true, summary: 'clean' }) });
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['brief', 'decisions', 'diff']);
  assert.equal(seen[0].brief, base.why);
  assert.match(seen[0].diff, /\+\+\+ b\/thing\.txt/);
  assert.match(seen[0].diff, /\+thing/);
  assert.ok(seen[0].decisions.some((d) => d.path === 'docs/decisions/0001-x.md' && /Decide x/.test(d.text)));
  assert.doesNotMatch(JSON.stringify(seen[0]), /AUTHOR SECRET/);
});

test('a PASS the reviewer flagged is queued for the audit', async () => {
  const s = scratch();
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  await ship(s.work, { ...base, review: pass('fine but read it', { flagged: true }) });
  assert.deepEqual(flaggedPrs(s.work), [7]);
});

test('the picker takes every flagged merged PR and a reproducible seeded ~20% sample', () => {
  const merged = Array.from({ length: 30 }, (_, i) => i + 1);
  const a = pickAudit(merged, [4, 9, 99], { seed: 42 });
  assert.deepEqual(a, pickAudit(merged, [4, 9, 99], { seed: 42 }));
  assert.notDeepEqual(a.prs, pickAudit(merged, [4, 9, 99], { seed: 43 }).prs);
  assert.deepEqual(a.flagged, [4, 9], 'a flagged PR that has not merged is not picked');
  assert.ok(a.prs.includes(4) && a.prs.includes(9));
  assert.equal(a.prs.length, 2 + Math.ceil(0.2 * 28));
  assert.deepEqual(pickAudit([], [], { seed: 1 }), { prs: [], flagged: [] });
});

test('audit pick writes the audit.json the digest reads and consumes the flagged PRs it included', () => {
  const s = scratch();
  mkdirSync(path.join(s.work, '.go-getter/state/digest'), { recursive: true });
  writeFileSync(path.join(s.work, '.go-getter/state/digest/flagged.json'), JSON.stringify({ prs: [3, 50] }));
  const now = new Date('2026-11-04T12:00:00Z');
  const merged = [1, 2, 3, 4, 5].map((n) => ({ number: n, title: `t${n}`, mergedAt: '2026-11-04T10:00:00Z' }));
  const r = auditPick(s.work, { seed: 7, now, exec: () => JSON.stringify(merged) });
  assert.deepEqual(r.flagged, [3]);
  const file = JSON.parse(readFileSync(path.join(s.work, '.go-getter/state/digest/audit.json'), 'utf8'));
  assert.deepEqual(file, { prs: r.prs, flagged: [3] });
  assert.deepEqual(buildDigest(s.work, { now, exec: () => JSON.stringify(merged) }).audit, { prs: r.prs, flagged: [3] });
  assert.deepEqual(flaggedPrs(s.work), [50]);
  assert.throws(() => auditPick(s.work, { now, exec: () => { throw new Error('no gh'); } }), /gh CLI/);
});

test('audit fail creates a draft check, guardrail or reviewer-instruction stub with an index row', () => {
  const s = scratch();
  const cases = { check: 'docs/guardrails/check-audit-pr-12.md', guardrail: 'docs/guardrails/guardrail-audit-pr-12.md', instruction: 'docs/skills/reviewer-audit-pr-12.md' };
  for (const [as, rel] of Object.entries(cases)) {
    assert.equal(auditFail(s.work, 12, as, { now: new Date('2026-11-04T00:00:00Z') }), rel);
    const { data, body } = parseFrontmatter(readFileSync(path.join(s.work, rel), 'utf8'));
    assert.equal(data.status, 'draft');
    assert.match(body, /PR #12/);
    assert.match(readFileSync(path.join(s.work, path.dirname(rel), 'INDEX.md'), 'utf8'), new RegExp(`${path.basename(rel, '.md')},.*,draft`));
  }
  assert.throws(() => auditFail(s.work, 12, 'check'), /already exists/);
  assert.throws(() => auditFail(s.work, 12, 'nope'), /--as/);
});

test('go-getter audit fail and usage errors through the CLI', () => {
  const s = scratch();
  const run = (...args) => spawnSync(process.execPath, [cli, 'audit', ...args], { cwd: s.work, encoding: 'utf8' });
  assert.equal(run().status, 2);
  assert.equal(run('fail', '5').status, 2);
  const ok = run('fail', '5', '--as', 'guardrail');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(path.join(s.work, 'docs/guardrails/guardrail-audit-pr-5.md')));
  assert.equal(run('pick', '--rate', '2').status, 2);
});
