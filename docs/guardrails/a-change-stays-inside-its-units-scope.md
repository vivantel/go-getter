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
    - tier: 2
      check: go-getter verify and go-getter ship fail a change with a path outside the scope of the unit claimed from the worktree, naming the path
      run: node compiler/bin/go-getter.mjs work scope-check
    - tier: 3
      check: go-getter work scope-check passes against the default branch
      run: node compiler/bin/go-getter.mjs work scope-check --base origin/master
---

## Guardrail

Edit only paths inside the unit's declared scope. For anything outside it, file a change request to the unit that owns it. `go-getter work scope-check` fails an out-of-scope path by name; `verify` and `ship` run it. A worktree with no claimed unit has no scope and passes. The unit's own plan file, files `apply` owns, generated indexes and the generated plugin copy are always allowed. `go-getter work request <unit> --to <unit> [--park]` files the change request.
