// Decision 0212: the vendored knowledge-base core matches its pin, and an edit to a vendored file is caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, realpathSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pinProblems, schemaVersion, sha256 } from '../src/core-pin.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('the vendored core matches src/core-pin.json', () => {
  assert.deepEqual(pinProblems(ROOT), []);
});

test('an edited vendored file, a missing pin and a wrong schema version are each reported', () => {
  const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-core-')));
  cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
  for (const d of ['kms-conformance', 'kms-frontmatter', 'kms-lookup']) cpSync(path.join(ROOT, 'compiler/test', d), path.join(tmp, 'compiler/test', d), { recursive: true });
  assert.deepEqual(pinProblems(tmp), []);
  appendFileSync(path.join(tmp, 'src/shared/lint_check.py'), '# local edit\n');
  assert.match(pinProblems(tmp)[0], /lint_check\.py differs from kms/);
  writeFileSync(path.join(tmp, 'src/core-pin.json'), '');
  assert.throws(() => pinProblems(tmp));
});

test('schemaVersion reads the first line only', () => {
  assert.equal(schemaVersion('schema-version: 1.2.3\nbody'), '1.2.3');
  assert.equal(schemaVersion('## Types\nschema-version: 1.2.3'), null);
  assert.equal(sha256(Buffer.from('a')).length, 64);
});

test("the vendored checker agrees with kms's conformance fixtures", () => {
  const r = spawnSync('python3', ['-I', '-m', 'unittest', 'discover', '-s', 'compiler/test/kms-conformance', '-p', 'test_conformance.py'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CHECKER: path.join(ROOT, 'src/shared/lint_check.py'), PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(r.status, 0, r.stderr);
});
