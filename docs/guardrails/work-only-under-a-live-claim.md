---
id: work-only-under-a-live-claim
title: A unit is worked only under a live claim
status: draft
date: 2026-11-03
tags: [coordination, enforcement, guardrail]
governed-by: 0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker
grounded-in: [0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker, 0169-go-getter-defines-a-pull-protocol-for-workers-and-runs-no-fleet]
derivation-note: Given that a claim is the only atomic exclusion between workers, work done without one can duplicate or collide with another worker's.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; a worker claims a unit before editing for it and stops when its lease lapses
---

## Guardrail

Claim a unit (`go-getter work claim`) before working on it, and stop when its lease lapses. Where the project requires claims (pack answer `require-claims`), `ship` refuses a branch whose unit has no live claim held by the caller. Advisory (tier 1) until work-coordination K16 adds that check (it needs the branch-to-unit link).
