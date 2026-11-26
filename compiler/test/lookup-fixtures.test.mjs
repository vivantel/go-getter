// Holds go-getter's artifact lookup to kms's fixtures (kms evals/lint/lookup, decision b3-2): `(corpus, text) -> ids`.
// The fixtures come from GG_KMS_LOOKUP_DIR or a sibling kms checkout; without either the test is skipped, since the
// vendored copy needs a kms release (B3a's pin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadArtifacts, numberIndex, namedArtifacts } from '../src/refs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// A worktree sits beside the main checkout, so the sibling kms is found from the repository's common git dir.
const common = path.resolve(here, '..', '..', execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim());
const dir = process.env.GG_KMS_LOOKUP_DIR ?? path.resolve(common, '..', '..', 'kms', 'evals', 'lint', 'lookup');
const present = existsSync(path.join(dir, 'queries.json'));

test('lookup resolves every kms fixture query', { skip: !present && 'kms lookup fixtures not found' }, () => {
  const byId = loadArtifacts(path.join(dir, 'corpus'));
  const byNumber = numberIndex(byId);
  for (const q of JSON.parse(readFileSync(path.join(dir, 'queries.json'), 'utf8'))) {
    assert.deepEqual(namedArtifacts(q.text, byId, byNumber).map((a) => a.id), q.ids, q.name);
  }
});
