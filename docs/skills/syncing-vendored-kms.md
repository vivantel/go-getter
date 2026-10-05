---
id: syncing-vendored-kms
title: Procedure for syncing the vendored pack from upstream
status: active
date: 2026-10-04
tags: [vendoring, kms, procedural]
operationalizes: [vendored-kms-changes-only-via-sync]
---

## Procedure

1. Choose the target upstream `vivantel/kms` ref (a release tag, not a branch head). Read its CHANGELOG for breaking changes to the artifact model or skill layout.
2. Run `npm run sync:kms -- <ref>`. It replaces `vendor/kms/` wholesale from that ref and rewrites `vendor/kms.lock.json` (ref, commit SHA).
3. Recompile (`npm run build`) and run `npm run check:generated` and `npm run check:vendor`.
4. If skill paths, names or the artifact model changed, update the build's vendored-kms handling (`readVendored` in `compiler/src/build.mjs`) and any go-getter artifact that relied on the old behavior, and record a decision for any commitment that changes.
5. Commit the sync as one PR containing only the vendor tree, lockfile and regenerated output.
