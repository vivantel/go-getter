import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit, ledgerView, releaseUnit } from '../src/work/ops.mjs';
import { acceptUnit, acceptanceState, doneGate, unaccepted } from '../src/work/accept.mjs';
import { findUnit } from '../src/work/ops.mjs';
import { recordEscape, samplingRate } from '../src/work/escapes.mjs';
import { auditPick } from '../src/audit.mjs';

const MIN = 60_000;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const T0 = new Date('2026-11-04T09:00:00.000Z');
const at = (min) => new Date(T0.getTime() + min * MIN);
const who = (id, kind = 'agent') => ({ kind, id });

const PLAN = `# Feature
Owner-id: dana

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\` · Accept: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\` · Accept: \`exit 3\`
Do: change the b module.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/c/** · Check: \`true\`
Do: change the c module.
`;

function world() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-accept-')));
  const bare = path.join(base, 'remote.git');
  sh(base, 'init', '--bare', '-b', 'main', bare);
  const seed = path.join(base, 'seed');
  sh(base, 'init', '-b', 'main', seed);
  sh(seed, 'config', 'user.name', 'seed');
  sh(seed, 'config', 'user.email', 'seed@example.test');
  mkdirSync(path.join(seed, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(seed, 'docs/plans/feat.md'), PLAN);
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '-m', 'seed');
  sh(seed, 'remote', 'add', 'origin', bare);
  sh(seed, 'push', 'origin', 'main');
  const clone = (name) => {
    const dir = path.join(base, name);
    sh(base, 'clone', bare, dir);
    sh(dir, 'config', 'user.name', name);
    sh(dir, 'config', 'user.email', `${name}@example.test`);
    return dir;
  };
  return { base, clone };
}
const marker = (dir, id) => new RegExp(`### ${id} .* — \\[(.)\\]`).exec(readFileSync(path.join(dir, 'docs/plans/feat.md'), 'utf8'))[1];

test('the author is refused, also after releasing the unit; another worker is accepted', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S1', who('alice'), { now: T0 })).ok);
  assert.ok((await releaseUnit(a, 'feat#S1', who('alice'), { now: at(1) })).ok);
  const refused = await acceptUnit(a, 'feat#S1', who('alice'), { now: at(2) });
  assert.equal(refused.code, 'author');
  assert.match(refused.error, /alice/);
  const b = w.clone('b');
  const ok = await acceptUnit(b, 'feat#S1', who('bob'), { now: at(3) });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.passed, true);
});

test('a passing acceptance records the result and moves the step to done; the ledger still reads only claims', async () => {
  const w = world();
  const a = w.clone('a');
  assert.equal(marker(a, 'S1'), ' ');
  const r = await acceptUnit(a, 'feat#S1', who('bob'), { now: T0 });
  assert.ok(r.passed);
  assert.equal(marker(a, 'S1'), 'x');
  const s = acceptanceState(a, findUnit(a, 'feat#S1'));
  assert.equal(s.state, 'passed');
  assert.equal(s.rec.by.id, 'bob');
  assert.equal(s.rec.exit, 0);
  assert.deepEqual(ledgerView(a, 'feat', { now: at(1) }).entries, [], 'an acceptance is not a claim');
});

test('a failing acceptance records the evidence and leaves the unit not done', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await claimUnit(a, 'feat#S2', who('alice'), { now: T0 })).ok);
  const r = await acceptUnit(w.clone('b'), 'feat#S2', who('bob'), { now: at(1) });
  assert.ok(r.ok);
  assert.equal(r.passed, false);
  assert.equal(r.rec.exit, 3);
  const b = w.clone('c');
  const s = acceptanceState(b, findUnit(b, 'feat#S2'));
  assert.equal(s.state, 'none', 'a clone that has not fetched the ledger sees nothing');
  const seen = acceptanceState(a, findUnit(a, 'feat#S2'));
  assert.ok(['failed', 'none'].includes(seen.state));
  assert.equal(marker(a, 'S2'), ' ', 'still not done');
  assert.equal(ledgerView(a, 'feat', { now: at(2) }).entries.find((e) => e.unit === 'feat#S2').state, 'claimed', 'the owner keeps the claim');
});

test('the reviewer gets the brief and the result and nothing else', async () => {
  const w = world();
  const a = w.clone('a');
  const out = path.join(w.base, 'reviewer-input.json');
  const r = await acceptUnit(a, 'feat#S1', who('bob'), { reviewer: `cat > ${out}`, now: T0 });
  assert.ok(r.passed, r.error);
  const input = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(input).sort(), ['brief', 'result']);
  assert.deepEqual(Object.keys(input.result).sort(), ['command', 'exit', 'output']);
  assert.equal(input.brief.Do, 'change the a module.');
  const rejected = await acceptUnit(w.clone('c'), 'feat#S1', who('carol'), { reviewer: 'exit 1', now: at(1) });
  assert.equal(rejected.passed, false, 'a reviewer that rejects fails the acceptance');
});

test('done is refused while a required Accept has not passed, and allowed after it', async () => {
  const w = world();
  const a = w.clone('a');
  const file = path.join(a, 'docs/plans/feat.md');
  const gate = doneGate(a, file, 'S1');
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /has not passed/);
  assert.equal(doneGate(a, file, 'S3').ok, true, 'a step without Accept is not gated');
  writeFileSync(file, readFileSync(file, 'utf8').replace('### S1 One — [ ]', '### S1 One — [x]'));
  assert.deepEqual(unaccepted(a).map((u) => u.unit), ['feat#S1'], 'accept-check names a done step without a pass');
  await acceptUnit(a, 'feat#S1', who('bob'), { now: T0 });
  assert.equal(doneGate(a, file, 'S1').ok, true);
  assert.deepEqual(unaccepted(a), []);
});

test('an escape found a level up raises the sampling rate of the level below, within the daily cap', () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-escape-')));
  const now = new Date('2026-11-05T00:00:00Z');
  assert.equal(samplingRate(dir, 'step', { now }), 0.2);
  assert.deepEqual(recordEscape(dir, { unit: 'feat#S1', mergedAt: 'step', foundAt: 'step', now }), { escape: false }, 'found where it merged is not an escape');
  assert.deepEqual(recordEscape(dir, { unit: 'feat#S1', mergedAt: 'step', foundAt: 'plan', now }), { escape: true, raises: 'step' });
  assert.ok(Math.abs(samplingRate(dir, 'step', { now }) - 0.3) < 1e-9);
  assert.equal(samplingRate(dir, 'plan', { now }), 0.2, 'other levels are unchanged');
  recordEscape(dir, { unit: 'feat#S2', mergedAt: 'plan', foundAt: 'feature', now });
  assert.ok(Math.abs(samplingRate(dir, 'plan', { now }) - 0.3) < 1e-9);
  assert.equal(samplingRate(dir, 'step', { now, merged: 100, cap: 10 }), 0.1, 'the human cap limits the rate');
  assert.equal(samplingRate(dir, 'step', { now: new Date('2027-03-01T00:00:00Z') }), 0.2, 'an old escape no longer counts');
  // `audit pick` reads the raised rate
  const exec = () => JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ number: i + 1, title: 't', mergedAt: '2026-11-04T10:00:00Z' })));
  const picked = auditPick(dir, { since: new Date('2026-11-01T00:00:00Z'), now, seed: 1, exec });
  assert.ok(Math.abs(picked.rate - 0.3) < 1e-9);
  assert.equal(picked.prs.length, 3);
});
