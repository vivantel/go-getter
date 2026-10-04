---
id: guardrails-declare-enforcement
title: Every guardrail must declare how it is enforced
status: active
date: 2026-10-04
tags: [enforcement, guardrail, configuration]
governed-by: 0009-tiered-enforcement-git-ci-floor
grounded-in: [0009-tiered-enforcement-git-ci-floor, 0007-kms-artifacts-as-configuration-source-of-truth]
derivation-note: Given tiered enforcement (0009) read only from frontmatter (0007), a guardrail without a `go-getter.enforcement` entry is unenforceable and must be flagged.
go-getter:
  enforcement:
    - tier: 3
      check: "Every guardrail has a go-getter.enforcement entry; tier 2/3 entries have run; tier-1-only is marked advisory"
      run: "npm run check:guardrails"
---

## Guardrail

Each guardrail, here and in any pack-emitted artifact, carries at least one `go-getter.enforcement` entry. A guardrail with only tier 1 says so in its body.
