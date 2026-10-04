---
id: one-statement-one-job
title: A fact, guardrail or derivation-note states one thing
status: active
date: 2026-10-04
tags: [knowledge-management, guardrail]
governed-by: 0007-kms-artifacts-as-configuration-source-of-truth
grounded-in: [0007-kms-artifacts-as-configuration-source-of-truth]
derivation-note: Given artifacts are governed, verified and superseded individually (0007), an artifact holding two claims cannot have one changed without the other.
go-getter:
  enforcement:
    - tier: 1
      check: "kms lint check 11 (unsplit statements)"
---

## Guardrail

A fact, guardrail or derivation-note doing two distinct things is split into two files. Advisory (tier 1 only): judged by `kms:lint`.
