---
id: owned-files-never-clobbered
title: apply, update and remove must not overwrite or delete a modified owned item without --force
status: draft
date: 2026-10-06
tags: [generated-files, enforcement, guardrail]
governed-by: 0089-apply-records-ownership-in-a-manifest
grounded-in: [0089-apply-records-ownership-in-a-manifest, 0033-apply-keeps-no-record-of-what-it-wrote]
derivation-note: Given 0089 skips modified owned items, a command that overwrote or deleted one would lose a user's edit with nothing to show for it.
go-getter:
  enforcement:
    - tier: 3
      check: "Update and remove tests cover a modified file, key and block, each skipped and reported, and overwritten or removed only with --force"
      run: "npm run test:update"
---

## Guardrail

Never overwrite or delete a file, key or block that no longer matches the manifest unless `--force` is given; report it as `modified` and exit non-zero.
