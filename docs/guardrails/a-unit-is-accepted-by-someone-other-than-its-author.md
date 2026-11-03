---
id: a-unit-is-accepted-by-someone-other-than-its-author
title: A unit with an Accept check is accepted by a worker who is not its author
status: active
date: 2026-11-03
tags: [coordination, verification, guardrail]
governed-by: 0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author
grounded-in: [0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author, 0158-merge-requires-a-gate-stack-and-a-sampled-human-audit]
derivation-note: Given that an author's blind spots are the defects acceptance exists to find, the author cannot be the one who passes it.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; run Accept under another worker, with a reviewer that sees no author transcript
---

## Guardrail

A unit with an `Accept` check is not `done` until a worker other than any holder of it or its descendants has run the check and passed it. The acceptance reviewer receives the brief and the merged result, not the author's transcript. Advisory (tier 1) until work-coordination K10 refuses `done` otherwise.
