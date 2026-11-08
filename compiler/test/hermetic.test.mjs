// The hermetic guard (support/hermetic.mjs) is on for every test: the test environment is not the developer's machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './support/hermetic.mjs'; // a no-op under npm test (already preloaded); makes `node --test` on this file alone guarded too
import { storeDir } from '../src/secrets/approvals.mjs';

test('HOME and the approvals store are throwaway directories', () => {
  assert.ok(os.homedir().startsWith(path.join(realpathSync(os.tmpdir()), 'gg-home-')), os.homedir());
  assert.ok(storeDir().startsWith(os.homedir()), storeDir());
});

test('gh on PATH is the recording stub, not the real one', () => {
  assert.throws(() => execFileSync('gh', ['--version'], { stdio: 'ignore' }));
  assert.ok(existsSync(path.join(os.homedir(), 'gh-calls.log')));
  execFileSync('rm', [path.join(os.homedir(), 'gh-calls.log')]);
});
