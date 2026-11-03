---
id: work-only-under-a-live-claim
title: A unit is worked only under a live claim
status: active
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

Claim a unit (`go-getter work claim`) before working on it, keep the lease alive, and stop when it lapses. A branch for a unit whose claim is not held by the branch's author is not shipped. Advisory (tier 1) until work-coordination K2 adds the check at `ship`.
