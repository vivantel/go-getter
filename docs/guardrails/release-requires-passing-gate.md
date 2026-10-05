---
id: release-requires-passing-gate
title: A release requires all three verification layers to pass
status: active
date: 2026-10-04
tags: [verification, eval, ci, guardrail]
governed-by: 0013-layered-verification-gate
grounded-in: [0013-layered-verification-gate]
derivation-note: Given the three-layer gate (0013), tagging a release without all layers green skips a layer the gate defines as mandatory.
go-getter:
  enforcement:
    - tier: 3
      check: "The release workflow depends on the unit, golden/drift and behavior-eval jobs succeeding"
      run: "builtin:workflow-needs file=.github/workflows/release.yml job=release needs=test,golden,eval"
---

## Guardrail

Do not tag or publish a release unless unit tests, golden-output and drift checks, and behavior evals all pass.
