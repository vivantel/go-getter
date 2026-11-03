---
id: a-change-stays-inside-its-units-scope
title: A change touches only paths inside its unit's declared scope
status: draft
date: 2026-11-03
tags: [coordination, verification, guardrail]
governed-by: 0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units
grounded-in: [0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units]
derivation-note: Given that parallel units are kept apart by their declared scopes, an edit outside the scope defeats the exclusion the claim gave.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; ask the owning unit for a change outside the scope, never widen your own
---

## Guardrail

Edit only paths inside the unit's declared scope. For anything outside it, file a change request to the unit that owns it. Advisory (tier 1) until work-coordination K4 fails the verification gate on an out-of-scope path.
