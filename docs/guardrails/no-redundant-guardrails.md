---
id: no-redundant-guardrails
title: A guardrail scoped to one skill's own procedure belongs in that skill
status: active
date: 2026-10-04
tags: [knowledge-management, guardrail]
governed-by: 0007-kms-artifacts-as-configuration-source-of-truth
grounded-in: [0007-kms-artifacts-as-configuration-source-of-truth]
derivation-note: Given knowledge-base artifacts are this project's source of truth (0007), a guardrail that only restates one skill's procedure duplicates that skill and drifts from it.
go-getter:
  enforcement:
    - tier: 1
      check: "knowledge-base lint check 5 (redundant guardrails)"
---

## Guardrail

A guardrail only ever true "whenever skill X does Y", with no claim broader than X's procedure, goes in X's own body; otherwise reword it as a system-wide invariant. Advisory (tier 1 only): judged by `go-getter:lint`.
