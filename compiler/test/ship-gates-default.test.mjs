// `ship` gates by default (roadmap T8 follow-up, decision 0158): the Check of the step the branch works on is read from the
// plan, and the conform and reviewer gates are on unless turned off or unavailable. Every model gate here is a deterministic
// fake runner injected through the runner interface; no model is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ship } from '../src/ship.mjs';
import { modelGates } from '../src/commands/ship.mjs';
import { startRun, activeRun } from '../src/runs/record.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeGh = path.join(here, 'support/fake-gh.mjs');
const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ident } }).trim();

const PLAN = (marker, check) => `# Plan\n\n**Goal**: g\n\n### S1 First step — [${marker}]\nClass: implement · Needs: none · Check: \`${check}\`\nDo: the thing.\n\n### S2 Second step — [ ]\nClass: implement · Needs: S1 · Check: \`exit 9\`\n`;

function scratch({ plan } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gates-'));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  writeFileSync(path.join(work, 'README.md'), 'hello\n');
  if (plan) {
    mkdirSync(path.join(work, 'docs/plans'), { recursive: true });
    writeFileSync(path.join(work, 'docs/plans/p.md'), PLAN(' ', plan));
  }
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
  if (plan) writeFileSync(path.join(work, 'docs/plans/p.md'), PLAN('~', plan)); // what `plan start --worktree` leaves
  const state = path.join(dir, 'gh-state.json');
  process.env.PATH = `${bin}:${process.env.PATH.split(':').filter((p) => p !== bin).join(':')}`;
  process.env.GH_FAKE_STATE = state;
  process.env.GO_GETTER_HOME = path.join(dir, 'home');
  const s = { work, gh: () => JSON.parse(readFileSync(state, 'utf8')), setGh: (v) => writeFileSync(state, JSON.stringify(v)) };
  s.setGh({ checks: [[{ name: 'ci', bucket: 'pass' }]] });
  return s;
}

const base = { why: 'Things need a thing so users can do X.', intervalMs: 0, noCiGraceMs: 0 };
// A deterministic stand-in for the claude CLI: `claude --version` answers `version`, `claude -p` answers `verdict`.
const fakeClaude = (verdict, version = 0) => {
  const calls = [];
  const run = (cmd, args, o) => {
    calls.push({ cmd, args, input: o?.input });
    if (cmd !== 'claude') return { code: 127, out: '', err: 'no' };
    if (args[0] === '--version') return { code: version, out: version ? '' : '1.0', err: '' };
    return { code: 0, out: `looked\n${verdict}\n`, err: '' };
  };
  return { run, calls, prompts: () => calls.filter((c) => c.args[0] === '-p') };
};
const on = { conform: 'auto', review: 'auto' };
const gatesOf = (work) => activeRun(work).gates.map((g) => [g.gate, g.status]);

test('the Check of the step started in this worktree is read from the plan and run by default', async () => {
  const s = scratch({ plan: 'test -f thing.txt' });
  startRun(s.work, { plan: 'docs/plans/p.md', steps: ['S1'] });
  const lines = [];
  const r = await ship(s.work, { ...base }, undefined, (a, b) => lines.push(`${a}: ${b}`));
  assert.equal(r.merged, true);
  assert.ok(lines.some((l) => l === 'check: step S1: `test -f thing.txt`'), lines.join('\n'));
  assert.deepEqual(gatesOf(s.work).slice(0, 1), [['check', 'pass']]);
  assert.match(s.gh().pr.body, /check: step S1: `test -f thing.txt`/);
});

test('a failing plan Check stops ship before any pull request', async () => {
  const s = scratch({ plan: 'exit 4' });
  startRun(s.work, { plan: 'docs/plans/p.md', steps: ['S1'] });
  await assert.rejects(ship(s.work, { ...base }), /check gate failed: step S1: `exit 4` exited 4/);
  assert.equal(s.gh().pr, undefined);
  assert.deepEqual(gatesOf(s.work), [['check', 'fail']]);
});

test('with no step in progress the check gate is recorded skipped: no step', async () => {
  const s = scratch();
  const lines = [];
  const r = await ship(s.work, { ...base }, undefined, (a, b) => lines.push(`${a}: ${b}`));
  assert.equal(r.merged, true);
  assert.ok(lines.includes('check: skipped: no step'), lines.join('\n'));
});

test('an explicit --check wins over the plan step', async () => {
  const s = scratch({ plan: 'exit 4' });
  const lines = [];
  await ship(s.work, { ...base, check: 'true' }, undefined, (a, b) => lines.push(`${a}: ${b}`));
  assert.ok(lines.includes('check: `true`'), lines.join('\n'));
});

test('conform and review are on by default, see only diff, brief and decisions, and land in the run record and the PR body', async () => {
  const s = scratch();
  startRun(s.work, { plan: 'p', steps: ['S1'] });
  const c = fakeClaude('VERDICT: PASS looks right');
  const gates = modelGates(s.work, on, c.run);
  const r = await ship(s.work, { ...base, ...gates });
  assert.equal(r.merged, true);
  assert.deepEqual(gatesOf(s.work), [['check', 'skipped'], ['conform', 'pass'], ['review', 'pass'], ['ci', 'pass']]);
  assert.equal(c.prompts().length, 2);
  assert.match(c.prompts()[1].input, /## Brief\n\nThings need a thing/);
  assert.match(s.gh().pr.body, /conform: looks right/);
  assert.match(s.gh().pr.body, /review: looks right/);
});

test('--no-conform and --no-review turn a gate off and record why', async () => {
  const s = scratch();
  startRun(s.work, { plan: 'p', steps: ['S1'] });
  const c = fakeClaude('VERDICT: PASS fine');
  const gates = modelGates(s.work, { conform: false, review: 'auto' }, c.run);
  const lines = [];
  await ship(s.work, { ...base, ...gates }, undefined, (a, b) => lines.push(`${a}: ${b}`));
  assert.ok(lines.includes('conform: skipped: turned off (--no-conform)'), lines.join('\n'));
  assert.equal(c.prompts().length, 1);
  assert.deepEqual(gatesOf(s.work).map((g) => g.join(':')), ['check:skipped', 'conform:skipped', 'review:pass', 'ci:pass']);
});

test('no claude on PATH records skipped with the reason and ship still merges', async () => {
  const s = scratch();
  const c = fakeClaude('', 127);
  const lines = [];
  const r = await ship(s.work, { ...base, ...modelGates(s.work, on, c.run) }, undefined, (a, b) => lines.push(`${a}: ${b}`));
  assert.equal(r.merged, true);
  assert.ok(lines.includes('conform: skipped: claude CLI not on PATH'), lines.join('\n'));
  assert.ok(lines.includes('review: skipped: claude CLI not on PATH'), lines.join('\n'));
  assert.equal(c.prompts().length, 0);
});

test('a failing default gate stops before any pull request', async () => {
  for (const [verdict, re] of [['VERDICT: FAIL breaks 0042', /conform gate failed: breaks 0042/]]) {
    const s = scratch();
    await assert.rejects(ship(s.work, { ...base, ...modelGates(s.work, on, fakeClaude(verdict).run) }), re);
    assert.equal(s.gh().pr, undefined);
  }
  // the reviewer alone failing
  const s = scratch();
  const run = (cmd, args, o) => (args[0] === '--version' ? { code: 0, out: '1', err: '' } : { code: 0, out: /strict reviewer/.test(o.input) ? 'VERDICT: FAIL race in the lock\n' : 'VERDICT: PASS ok\n', err: '' });
  await assert.rejects(ship(s.work, { ...base, ...modelGates(s.work, on, run) }), /review found problems: race in the lock/);
  assert.equal(s.gh().pr, undefined);
});

test('a reached spend cap skips the model gates', async () => {
  const s = scratch();
  startRun(s.work, { plan: 'p', steps: ['S1'], spendCapUsd: 1 });
  mkdirSync(path.join(s.work, '.go-getter/state'), { recursive: true });
  writeFileSync(path.join(s.work, '.go-getter/state/telemetry.jsonl'), `${JSON.stringify({ ts: new Date(Date.now() + 1000).toISOString(), event: 'x', cost: 1.5 })}\n`);
  const c = fakeClaude('VERDICT: PASS x');
  const gates = modelGates(s.work, on, c.run);
  assert.deepEqual(gates, { conform: { skip: 'spend cap of $1 reached' }, review: { skip: 'spend cap of $1 reached' } });
  assert.equal(c.calls.length, 0);
});

test('a model registry without an eligible provider skips the model gates', () => {
  const s = scratch();
  mkdirSync(path.join(s.work, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(s.work, 'docs/decisions/0001-reg.md'), '---\nid: 0001-reg\ntitle: Registry\nstatus: active\ndate: 2026-01-01\ntags: [security]\ngo-getter:\n  model-registry:\n    providers:\n      - id: other\n---\n\n## Decision\n\nx\n');
  const c = fakeClaude('VERDICT: PASS x');
  const gates = modelGates(s.work, on, c.run);
  assert.match(gates.review.skip, /no eligible model for internal data/);
  assert.equal(c.calls.length, 0);
  assert.ok(existsSync(path.join(s.work, 'docs/decisions/0001-reg.md')));
});
