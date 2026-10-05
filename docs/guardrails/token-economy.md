---
id: token-economy
title: Facts, guardrails and procedures use the shortest phrasing that preserves meaning
status: active
date: 2026-10-04
tags: [knowledge-management, cost, guardrail]
governed-by: 0016-quality-gated-cache-aware-model-routing
grounded-in: [0016-quality-gated-cache-aware-model-routing, 0007-kms-artifacts-as-configuration-source-of-truth]
derivation-note: Given artifacts are read into agent context (0007) and go-getter commits to minimal token spend (0016), every unnecessary word in them is a recurring cost.
go-getter:
  enforcement:
    - tier: 1
      check: "knowledge-base lint check 10 (verbose artifacts)"
---

## Guardrail

Facts, guardrails and procedures (decisions and plans exempt) use the shortest unambiguous phrasing. Advisory (tier 1 only): judged by `go-getter:lint`.
