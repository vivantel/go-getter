import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { ciStatus } from '../src/ci.mjs';
import { evaluateStop, respondStop } from '../src/verify.mjs';
import { readLog } from '../src/telemetry/record.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'compiler/bin/go-getter.mjs');
const pack = loadPack(path.join(root, 'src/packs/verification-gate/pack.json'));
const telemetry = loadPack(path.join(root, 'src/packs/telemetry/pack.json'));
const STATE = path.join('.go-getter', 'state');
const PASS = 'node -e "process.exit(0)"';
const LOG_LINES = Array.from({ length: 20 }, (_, i) => `verify-build\tnpm run build\t2026-10-06T00:00:${String(i).padStart(2, '0')}Z error line ${i + 1}`).join('\n');

// A stub `gh` answering from files in $GH_STUB: runs.json, jobs-<run>.json and log-<job>.txt.
const stubBin = mkdtempSync(path.join(tmpdir(), 'gg-gh-'));
writeFileSync(path.join(stubBin, 'gh'), `#!/bin/sh
[ "$1 $2" = "run list" ] && exec cat "$GH_STUB/runs.json"
[ "$1 $2 $3" = "run view --job" ] && exec cat "$GH_STUB/log-$4.txt"
[ "$1 $2" = "run view" ] && exec cat "$GH_STUB/jobs-$3.json"
exit 1
`);
chmodSync(path.join(stubBin, 'gh'), 0o755);
// A PATH with git and node but no gh.
const noGh = mkdtempSync(path.join(tmpdir(), 'gg-nogh-'));
symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(noGh, 'git'));
symlinkSync(process.execPath, path.join(noGh, 'node'));
const realPath = process.env.PATH;

const RUNS = { green: 'success', red: 'failure', pending: null };
function stub(kind, sha) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-ghdata-'));
  const completed = kind !== 'pending';
  writeFileSync(path.join(dir, 'runs.json'), JSON.stringify([{ databaseId: 7, headSha: sha, status: completed ? 'completed' : 'in_progress', conclusion: RUNS[kind] ?? '', workflowName: 'go-getter checks' }]));
  writeFileSync(path.join(dir, 'jobs-7.json'), JSON.stringify({ jobs: [
    { databaseId: 70, name: 'go-getter-checks', status: 'completed', conclusion: 'success' },
    { databaseId: 71, name: 'verify-build', status: completed ? 'completed' : 'in_progress', conclusion: RUNS[kind] ?? '' },
  ] }));
  writeFileSync(path.join(dir, 'log-71.txt'), `${LOG_LINES}\n`);
  return dir;
}
const useGh = (dir) => { process.env.GH_STUB = dir; process.env.PATH = `${stubBin}${path.delimiter}${realPath}`; };

const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();
const adopt = (dir, answers, p = pack) => applyRender({ root: dir, plan: planRender({ root: dir, pack: p, answers, acceptedBy: 't', date: '2026-10-06' }) });

// A project with a thin profile (build in CI), committed and pushed to a local bare remote.
function pushedProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-ci-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nverification — x\nharness — x\nguardrail — x\nobservability — x\n');
  writeFileSync(path.join(dir, '.gitignore'), `${STATE}/\n`);
  git(dir, 'init', '-q', '-b', 'feat/x');
  adopt(dir, { checks: 'detected', 'test-command': PASS, 'lint-command': PASS, 'typecheck-command': '', 'build-command': PASS, 'machine-profile': 'thin', 'review-bar': 'none', gate: 'block' });
  adopt(dir, { recording: 'metadata-log', retention: '30', export: 'none' }, telemetry);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'adopt');
  const remote = mkdtempSync(path.join(tmpdir(), 'gg-remote-'));
  git(remote, 'init', '-q', '--bare');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', '-u', 'origin', 'feat/x');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD'), cleanup: () => [dir, remote].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

const ci = (dir, env, ...args) => spawnSync(process.execPath, [bin, 'ci', 'status', '--project', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('ci status reports green, red and pending CI with one line per job and exits accordingly', () => {
  const { dir, sha, cleanup } = pushedProject();
  const green = ci(dir, { PATH: `${stubBin}${path.delimiter}${realPath}`, GH_STUB: stub('green', sha) });
  assert.equal(green.status, 0);
  assert.equal(green.stdout, `ci success feat/x ${sha.slice(0, 7)}\npass go-getter-checks\npass verify-build\n`);

  const red = ci(dir, { PATH: `${stubBin}${path.delimiter}${realPath}`, GH_STUB: stub('red', sha) }, '--branch', 'feat/x');
  assert.equal(red.status, 1);
  const lines = red.stdout.trimEnd().split('\n');
  assert.deepEqual(lines.slice(0, 4), [`ci failure feat/x ${sha.slice(0, 7)}`, 'pass go-getter-checks', 'FAIL verify-build', '  2026-10-06T00:00:05Z error line 6']);
  assert.equal(lines.length, 3 + 15, 'only the last 15 log lines of the failed job');
  assert.equal(lines.at(-1), '  2026-10-06T00:00:19Z error line 20');

  const pending = ci(dir, { PATH: `${stubBin}${path.delimiter}${realPath}`, GH_STUB: stub('pending', sha) });
  assert.equal(pending.status, 3);
  assert.match(pending.stdout, /^ci pending .*\npass go-getter-checks\npending verify-build\n$/);
  cleanup();
});

test('ci status without gh reports unknown; a bad call prints usage', () => {
  const { dir, cleanup } = pushedProject();
  const res = ci(dir, { PATH: noGh });
  assert.equal(res.status, 4);
  assert.equal(res.stdout, 'ci unknown feat/x\n');
  assert.equal(spawnSync(process.execPath, [bin, 'ci', 'bogus'], { encoding: 'utf8' }).status, 2);
  assert.equal(ci(dir, {}, '--nope').status, 2);
  cleanup();
});

test('ciStatus treats a branch whose runs are all of older commits as pending', () => {
  const { dir, sha, cleanup } = pushedProject();
  useGh(stub('green', 'f'.repeat(40)));
  assert.equal(ciStatus(dir, { branch: 'feat/x', sha }).state, 'pending');
  assert.equal(ciStatus(dir, { branch: 'feat/x' }).state, 'success', 'without a commit, the latest run counts');
  process.env.PATH = realPath;
  cleanup();
});

test('the stop gate treats a pushed branch with red CI as not done, bounded by max-escalations', async () => {
  const { dir, sha, cleanup } = pushedProject();
  useGh(stub('red', sha));
  const outcomes = [];
  for (let i = 0; i < 4; i++) {
    const d = await evaluateStop(dir, { session_id: 's1' });
    outcomes.push(d.block ? 'block' : d.escalated ? 'escalated' : 'allow');
    if (i === 0) {
      assert.match(d.reason, /fix the failing CI jobs/);
      assert.match(d.reason, /FAIL verify-build\n {2}.*error line 6/);
      assert.match(d.reason, /attempt 1 of 2/);
    }
  }
  assert.deepEqual(outcomes, ['block', 'block', 'escalated', 'block'], 'two blocks, a hand-over, then the count starts afresh');
  assert.deepEqual(readLog(dir).filter((r) => r.event === 'verify:gate').map((r) => r.outcome), ['blocked', 'blocked', 'escalated', 'blocked']);
  assert.deepEqual([...new Set(readLog(dir).filter((r) => r.event === 'verify:ci').map((r) => r.outcome))], ['fail']);
  process.env.PATH = realPath;
  cleanup();
});

test('the stop gate hands over on pending CI and allows green CI', async () => {
  const { dir, sha, cleanup } = pushedProject();
  useGh(stub('pending', sha));
  const pending = await evaluateStop(dir, { session_id: 's1' });
  assert.equal(pending.block, false);
  assert.equal(pending.handover, true);
  assert.match(pending.reason, /CI is still running for feat\/x/);
  assert.match(pending.reason, /go-getter watch --until done -- go-getter ci status --wait/);
  assert.deepEqual(respondStop('claude-code', pending), { code: 0, stdout: '', stderr: pending.reason });

  useGh(stub('green', sha));
  assert.deepEqual(await evaluateStop(dir, { session_id: 's1' }), { block: false });
  useGh(stub('red', sha));
  assert.deepEqual(await evaluateStop(dir, { session_id: 's1' }), { block: false }, 'a commit seen green is not asked again');
  process.env.PATH = realPath;
  cleanup();
});

test('the stop gate leaves an unpushed commit and a missing gh alone', async () => {
  const { dir, sha, cleanup } = pushedProject();
  process.env.PATH = noGh;
  assert.deepEqual(await evaluateStop(dir, { session_id: 's1' }), { block: false }, 'CI unknown');
  useGh(stub('red', sha));
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'local only');
  assert.deepEqual(await evaluateStop(dir, { session_id: 's1' }), { block: false }, 'HEAD is not pushed');
  process.env.PATH = realPath;
  cleanup();
});
