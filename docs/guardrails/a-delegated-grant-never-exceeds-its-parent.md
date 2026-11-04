---
id: a-delegated-grant-never-exceeds-its-parent
title: A delegated grant never exceeds its parent's on any dimension
status: draft
date: 2026-11-03
tags: [coordination, hooks, guardrail]
governed-by: 0171-grants-only-narrow-down-the-delegation-tree
grounded-in: [0171-grants-only-narrow-down-the-delegation-tree, 0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops]
derivation-note: Given that agents may sub-delegate without a human, a grant that could widen would let any worker escape the authority a human wrote.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; a grant is issued only within the issuer's own grant
    - tier: 2
      check: go-getter work grant refuses a grant wider than its parent's on any dimension or carrying an always-human action, every reader ignores such an entry, and go-getter verify fails while the ledger holds one
      run: node compiler/bin/go-getter.mjs work grant-check
---

## Guardrail

A grant issued to a child unit is a subset of its parent's grant on scope, spend, command shapes, ask policy, data classes and real-world effects with their caps. Force-push, history rewrite, shared-branch deletion, repository settings, tags, releases and publishing are never delegated. `go-getter work grant <unit> --scope … --spend … --shapes … --asks … --data … [--effects …]` refuses a wider grant and any always-human shape, and every reader of the claims ledger re-runs the check and ignores an entry that fails it; `go-getter work grant-check` fails while one is in the ledger. A root grant is valid only from a human listed in `docs/workers.md` (advisory against stolen credentials).
