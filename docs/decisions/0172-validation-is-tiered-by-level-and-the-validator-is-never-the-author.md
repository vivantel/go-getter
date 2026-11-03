---
id: 0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author
title: Validation is tiered by level, strictness rises up the tree, and the validator is never the author
status: active
date: 2026-11-03
tags: [coordination, verification, agent-roles]
track: process
accepted-by: sergemso
---

## Decision

1. **Tiers.**

| Level | Validated by |
|---|---|
| Step | its `Check` and CI only, so intermediate steps stay unblocked |
| Plan | the gate stack of 0158 on the integrated plan, and the plan's `Accept` check |
| Feature | an independent acceptance pass: a fresh-context reviewer given only the feature brief and the merged result, cross-plan contract checks and the feature's behavior evals |
| Product / release | the three layers of 0013, and the human sign-off on the batched release (0155) |
| Outcome | the meter reaching its target over its window with the attribution method holding (0178); this tier applies to a feature or product whose brief names an outcome, and it is the only tier that can fail after everything below has passed |

2. **The validator is never the author.** A unit's `Accept` runs under a worker whose id differs from every holder of that unit and its descendants, and the reviewer sees no author transcript. Every claim also appends the holder to `refs/go-getter/holders/<unit>`, which is never deleted, so a released unit keeps its history and `work accept` checks against it. Worker ids are self-declared until claims are signed (a later step), so this stops accidents and honest mistakes, not a worker that lies about who it is; the guardrail says so. A unit with an `Accept` is not `done` until it passes.
3. **Failure returns to the owner.** A failed acceptance re-opens the unit under its claim with the failing evidence; siblings are not blocked.
4. **Sampling adapts to escapes, within a human cap.** The target audit sample is 20% at the PR level (0158 item 2), but the human reading it is capped per human per day (a pack answer, default 10 reads) and the sample is spread across the `Owner-id` chain by unit, with every PR the reviewer flagged always included. When the cap is below the target rate the sampling rate falls, and `metrics flow` reports the realized coverage so the lost assurance is visible. A defect found at a higher level than the one that merged it is an escape: it becomes a check, guardrail or reviewer instruction (0158 item 3), and the sampling rate at the level below rises until the escape rate recovers.
5. **`Accept` is required** on a plan and above, optional on a step.

It extends 0158 from the PR to every level and keeps 0013 and `release-requires-passing-gate` as the product tier.

## Why

0158 defines validation for one PR. A feature built from hundreds of PRs can be wrong while each PR is green, and a 20% sample of PRs cannot find that. Putting an independent acceptance at each level the owner delegates gives a quality bar that grows with the size of the outcome, while cheap steps stay cheap.

## Tradeoffs considered

- **Sampling only:** a statistical control that bounds the owner's time, not an outcome bar.
- **Acceptance at every step:** the highest assurance, and the slowest.
- **Cost accepted:** an acceptance run per plan and feature, and a second worker needed for every accepted unit.
