---
id: a-delegated-grant-never-exceeds-its-parent
title: A delegated grant never exceeds its parent's on any dimension
status: active
date: 2026-11-03
tags: [coordination, hooks, guardrail]
governed-by: 0171-grants-only-narrow-down-the-delegation-tree
grounded-in: [0171-grants-only-narrow-down-the-delegation-tree, 0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops]
derivation-note: Given that agents may sub-delegate without a human, a grant that could widen would let any worker escape the authority a human wrote.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; a grant is issued only within the issuer's own grant
---

## Guardrail

A grant issued to a child unit is a subset of its parent's grant on scope, spend, command shapes, ask policy and data classes. Force-push, history rewrite, shared-branch deletion, repository settings, tags, releases and publishing are never delegated. Advisory (tier 1) until work-coordination K8 refuses a wider grant.
