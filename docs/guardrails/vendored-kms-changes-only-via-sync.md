---
id: vendored-kms-changes-only-via-sync
title: Vendored kms files change only through the sync script
status: active
date: 2026-10-04
tags: [vendoring, kms, guardrail]
governed-by: 0006-vendor-kms-as-builtin-pack
grounded-in: [0006-vendor-kms-as-builtin-pack]
derivation-note: Given kms is vendored from an upstream authority (0006), local edits would silently diverge from upstream and be overwritten at the next sync.
go-getter:
  enforcement:
    - tier: 3
      check: "vendor/kms/ equals upstream vivantel/kms at the ref pinned in vendor/kms.lock.json"
      run: "npm run check:vendor"
---

## Guardrail

Never edit `vendor/kms/` by hand. Change kms upstream, then bump the pin and re-sync per `docs/skills/syncing-vendored-kms.md`.
