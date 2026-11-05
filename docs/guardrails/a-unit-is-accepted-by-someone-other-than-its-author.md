---
id: a-unit-is-accepted-by-someone-other-than-its-author
title: A unit with an Accept check is accepted by a worker who is not its author
status: draft
date: 2026-11-03
tags: [coordination, verification, guardrail]
governed-by: 0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author
grounded-in: [0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author, 0158-merge-requires-a-gate-stack-and-a-sampled-human-audit]
derivation-note: Given that an author's blind spots are the defects acceptance exists to find, the author cannot be the one who passes it.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; run Accept under another worker, with a reviewer that sees no author transcript
    - tier: 2
      check: go-getter work accept refuses a worker who ever held the unit or a descendant, plan done refuses a step whose Accept has not passed, and work accept-check fails a done unit with no passing acceptance
      run: node compiler/bin/go-getter.mjs work accept-check
---

## Guardrail

A unit with an `Accept` check is not `done` until a worker other than any holder of it or its descendants has run the check and passed it. The acceptance reviewer receives the brief and the merged result, not the author's transcript. Worker ids are self-declared until claims are signed, so this stops mistakes, not a worker that lies. `go-getter work accept <unit>` refuses a worker whose id is among the unit's holders in the ledger history, `go-getter plan done` refuses a step whose `Accept` has not passed, and `go-getter work accept-check` names any done unit that lacks a passing acceptance.
