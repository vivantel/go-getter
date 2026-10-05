---
id: one-statement-one-job
title: A fact, guardrail or derivation-note states one thing
status: active
date: 2026-10-04
tags: [knowledge-management, guardrail]
governed-by: 0066-own-the-knowledge-base-tooling
grounded-in: [0066-own-the-knowledge-base-tooling]
derivation-note: Given artifacts are governed, verified and superseded individually (0066), an artifact holding two claims cannot have one changed without the other.
go-getter:
  enforcement:
    - tier: 1
      check: "knowledge-base lint check 11 (unsplit statements)"
---

## Guardrail

A fact, guardrail or derivation-note doing two distinct things is split into two files. Advisory (tier 1 only): judged by `go-getter:lint`.
