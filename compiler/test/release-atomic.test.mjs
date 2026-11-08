import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeVersionFiles, writeChangelog } from '../src/release.mjs';

// A write that goes through a temp file and a rename leaves the old file's content (its inode) whole at every moment, so a release
// killed halfway never leaves a truncated file. A hard link to the old file shows which kind of write happened: an in-place write
// changes what the link reads, a replacement does not.
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-release-atomic-'));
  writeFileSync(path.join(dir, 'package.json'), '{\n  "name": "x",\n  "version": "1.0.0"\n}\n');
  writeFileSync(path.join(dir, 'package-lock.json'), '{\n  "name": "x",\n  "version": "1.0.0",\n  "packages": { "": { "version": "1.0.0" } }\n}\n');
  writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-01-01\n');
  return dir;
}

test('a killed release leaves the old file intact: version files and changelog are replaced, not rewritten in place', () => {
  const dir = project();
  const kept = {};
  for (const name of ['package.json', 'package-lock.json', 'CHANGELOG.md']) {
    kept[name] = { link: path.join(dir, `${name}.old`), text: readFileSync(path.join(dir, name), 'utf8') };
    linkSync(path.join(dir, name), kept[name].link);
  }
  writeVersionFiles(dir, '1.1.0');
  writeChangelog(dir, '## [1.1.0] - 2026-02-02\n');
  for (const [name, { link, text }] of Object.entries(kept)) {
    assert.equal(readFileSync(link, 'utf8'), text, `${name} was overwritten in place`);
    assert.notEqual(readFileSync(path.join(dir, name), 'utf8'), text, `${name} was not updated`);
  }
});
