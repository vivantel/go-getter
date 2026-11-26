// Holds go-getter's artifact lookup to kms's fixtures (kms evals/lint/lookup, decision b3-2): `(corpus, text) -> ids`.
// The fixtures are vendored under kms-lookup/ by `go-getter core update`; GG_KMS_LOOKUP_DIR overrides the directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArtifacts, numberIndex, namedArtifacts } from '../src/refs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.GG_KMS_LOOKUP_DIR ?? path.join(here, 'kms-lookup');

test('lookup resolves every kms fixture query', () => {
  const byId = loadArtifacts(path.join(dir, 'corpus'));
  const byNumber = numberIndex(byId);
  for (const q of JSON.parse(readFileSync(path.join(dir, 'queries.json'), 'utf8'))) {
    assert.deepEqual(namedArtifacts(q.text, byId, byNumber).map((a) => a.id), q.ids, q.name);
  }
});
