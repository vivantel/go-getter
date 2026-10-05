#!/usr/bin/env node
// npm run sync:kms -- <ref> [--repo <url>]: replace vendor/kms/ with upstream plugins/kms at <ref>.
// Procedure: docs/skills/syncing-vendored-kms.md
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncKms } from '../compiler/src/vendor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let ref;
let repo;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--repo') repo = args[++i];
  else ref = args[i];
}
try {
  const lock = syncKms(root, { ref, repo });
  console.log(`sync:kms: vendored ${lock.repo}@${lock.ref} (${lock.sha.slice(0, 12)}) into vendor/kms/`);
} catch (err) {
  console.error(`sync:kms: ${err.message}`);
  process.exitCode = 1;
}
