// For a test that runs code which asks `gh` and expects it to be offline: puts a `gh` that always fails first on PATH for this
// process and its children, and returns the call that undoes it. The hermetic guard (hermetic.mjs) fails a test whose `gh` is
// neither this nor another stub.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installGh } from './gh-stub.mjs';

export function offlineGh() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-offline-gh-'));
  installGh(dir, { fail: true });
  const before = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${before}`;
  return () => {
    process.env.PATH = before;
    rmSync(dir, { recursive: true, force: true });
  };
}
