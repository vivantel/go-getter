import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runnerScript } from '../src/apply.mjs';

// The generated runner, run in a scratch directory with a fake `npx` first on PATH.
function setup(version, npx) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-runner-'));
  const runner = path.join(dir, 'runner.sh');
  writeFileSync(runner, runnerScript(version));
  const bin = path.join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin]);
  writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\n${npx}\n`);
  chmodSync(path.join(bin, 'npx'), 0o755);
  const run = (args, env = {}) =>
    spawnSync('sh', [runner, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GO_GETTER_CLI: '', ...env } });
  return { dir, run };
}

test('a release is pinned to its tag and an unreleased build is not', () => {
  assert.match(runnerScript('0.1.0'), /npx --yes github:vivantel\/go-getter#v0\.1\.0 "\$@"/);
  assert.doesNotMatch(runnerScript('0.0.0'), /go-getter#v/);
  assert.doesNotMatch(runnerScript(undefined), /go-getter#v/);
});

test('GO_GETTER_CLI runs a local checkout and npx is not used', () => {
  const { dir, run } = setup('0.1.0', 'echo npx-was-called >&2; exit 1');
  const cli = path.join(dir, 'cli.mjs');
  writeFileSync(cli, 'console.log(`cli:${process.argv.slice(2).join(" ")}`);');
  const res = run(['hook', 'pre-tool'], { GO_GETTER_CLI: cli });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), 'cli:hook pre-tool');
  assert.doesNotMatch(res.stderr, /npx-was-called/);
  rmSync(dir, { recursive: true, force: true });
});

test('a GO_GETTER_CLI that is not a file warns and falls back to npx', () => {
  const { dir, run } = setup('0.1.0', 'echo "npx:$*"');
  const res = run(['check'], { GO_GETTER_CLI: path.join(dir, 'missing.mjs') });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /is not a file; trying npx/);
  assert.match(res.stdout, /npx:--yes github:vivantel\/go-getter#v0\.1\.0 check/);
  rmSync(dir, { recursive: true, force: true });
});

test('an npm failure keeps its exit code and names the way out', () => {
  const { dir, run } = setup('0.0.0', 'echo "npm error code EALLOWGIT" >&2; exit 1');
  const res = run(['hook', 'pre-tool']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /npm error code EALLOWGIT/);
  assert.match(res.stderr, /this call was not enforced/);
  assert.match(res.stderr, /GO_GETTER_CLI/);
  rmSync(dir, { recursive: true, force: true });
});

test('a denial from the CLI passes through unchanged, with its stdin and no hint', () => {
  const { dir, run } = setup('0.0.0', 'cat >/dev/null; echo "blocked by guardrail x" >&2; exit 2');
  const res = run(['hook', 'pre-tool']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /blocked by guardrail x/);
  assert.doesNotMatch(res.stderr, /not enforced/);
  rmSync(dir, { recursive: true, force: true });
});

test('the CLI copy in .go-getter/cli runs before npx, and GO_GETTER_CLI before the copy', () => {
  const { dir, run } = setup('0.1.0', 'echo npx-was-called >&2; exit 1');
  const vendored = path.join(dir, '.go-getter/cli/compiler/bin');
  spawnSync('mkdir', ['-p', vendored]);
  writeFileSync(path.join(vendored, 'go-getter.mjs'), 'console.log(`vendored:${process.argv.slice(2).join(" ")}`);');
  const res = run(['check']);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), 'vendored:check');
  assert.doesNotMatch(res.stderr, /npx-was-called/);
  const override = path.join(dir, 'override.mjs');
  writeFileSync(override, 'console.log("override");');
  assert.equal(run(['check'], { GO_GETTER_CLI: override }).stdout.trim(), 'override');
  rmSync(dir, { recursive: true, force: true });
});
