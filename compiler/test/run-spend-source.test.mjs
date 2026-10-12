// Spend coverage of a run (decision 0144, step 1 of docs/plans/run-spend.md): a cap on a host with no spend source is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { spendCoverage } from '../src/runs/spend.mjs';
import { startRun, activeRun, endRun } from '../src/runs/record.mjs';
import { buildReport } from '../src/runs/report.mjs';
import { packageCapabilities } from '../src/governance.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { installGh } from './support/gh-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const caps = { a: { telemetry: { spendSource: 'transcript' } }, b: { telemetry: { spendSource: 'none' } }, c: { telemetry: { spendSource: 'sessions' } } };

test('every capability row names a spend source', () => {
  for (const [host, c] of Object.entries(packageCapabilities())) assert.ok(['none', 'transcript', 'sessions'].includes(c.telemetry.spendSource), host);
});

test('a host with a source meters the cap and says nothing', () => {
  assert.deepEqual(spendCoverage(['a', 'c'], caps, 5), { metered: true, notice: null });
});

test('a host without a source cannot bind the cap, and the notice names the host and the stops that still apply', () => {
  const r = spendCoverage(['b'], caps, 5);
  assert.equal(r.metered, false);
  assert.match(r.notice, /spend cap of \$5 cannot bind on b/);
  assert.match(r.notice, /timeout, red fix attempts, repeated denials/);
});

test('with some hosts metered, the cap is metered and the notice names only the others', () => {
  const r = spendCoverage(['a', 'b'], caps, 5);
  assert.equal(r.metered, true);
  assert.match(r.notice, /cannot bind on b,? /);
  assert.doesNotMatch(r.notice, /on a/);
});

test('no detected host cannot bind the cap either; no cap means no notice', () => {
  assert.equal(spendCoverage([], caps, 5).metered, false);
  assert.match(spendCoverage([], caps, 5).notice, /no host agent detected/);
  assert.deepEqual(spendCoverage(['b'], caps, null), { metered: true, notice: null });
});

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-spend-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  mkdirSync(path.join(dir, '.cursor'));
  writeFileSync(path.join(dir, 'docs/plans/p.md'), '# P — plan\n\n**Status legend**: x\n\n### 1 Step 1 — [ ]\nIssue: #101\nClass: implement · Effort: low · Needs: none · Check: `true`\nDo: x.\nDone-when: x.\n');
  writeFileSync(path.join(dir, 'docs/decisions/0001-x.md'), '---\nid: 0001-x\ntitle: x\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  routing-start-tiers: {implement: small}\n  headless-spend-cap-usd: "5"\n  telemetry-recording: metadata-log\n---\n\n## Decision\n\nx\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: cleanGitEnv(process.env) });
  installGh(base, { repo: 'acme/app', issues: [] });
  symlinkSync(cli, path.join(base, 'go-getter'));
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${base}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    dir,
    cli: (...args) => spawnSync('node', [cli, ...args], { cwd: dir, encoding: 'utf8', env: process.env }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('run start on a host without a source prints the notice, starts, and records the run as unmetered; the report says so', () => {
  const s = setup();
  try {
    const r = s.cli('run', 'start', 'docs/plans/p.md');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /spend cap of \$5 cannot bind on cursor/);
    assert.equal(activeRun(s.dir).spendMetered, false);
    const { text } = buildReport(s.dir, endRun(s.dir));
    assert.match(text, /\*\*Spend:\*\* not metered on this host; the cap of \$5 could not bind/);
    assert.doesNotMatch(text, /\$0\.00/);
  } finally { s.cleanup(); }
});

test('a run without a cap prints no notice and keeps the dollar line', () => {
  const s = setup();
  try {
    writeFileSync(path.join(s.dir, 'docs/decisions/0001-x.md'), '---\nid: 0001-x\ntitle: x\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\n## Decision\n\nx\n');
    const r = s.cli('run', 'start', 'docs/plans/p.md');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /cannot bind/);
    assert.equal(activeRun(s.dir).spendMetered, undefined);
    assert.match(buildReport(s.dir, endRun(s.dir)).text, /\*\*Spend:\*\* \$0\.00 \(no cap\)/);
  } finally { s.cleanup(); }
});
