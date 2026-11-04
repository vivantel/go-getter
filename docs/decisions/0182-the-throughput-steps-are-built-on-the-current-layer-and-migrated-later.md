---
id: 0182-the-throughput-steps-are-built-on-the-current-layer-and-migrated-later
title: The throughput steps are built on the current layer and migrated to the work layer later
status: draft
date: 2026-11-04
tags: [coordination, roadmap]
track: process
---

## Decision

1. **T4, T8, T9 and G5 no longer wait for K11.** They are built on today's `ship`, `run` and plan format; K11 becomes the step that migrates them onto the work layer.
2. **The work-coordination plan is sliced.** The core is K1-K7 and K9. K20 (dogfood and measure) needs only the core; K8, K10, K12-K19, K22 and K23 follow.
3. **T10 runs as soon as T4, T5, T8 and T9 land**, not after the K plan.
4. **Dogfood order:** the sequence in `docs/plans/roadmap.md`, section "Dogfood order": reliable loop, then no merge conflicts at the source, then go-getter drives the rest, then measure.

## Why

K11 needed K3, K6, K7, K10 and K17, so the steps that cut the owner's own friction waited behind about fourteen steps of an unproven design, and the first real use of the new layer came last. Building on the current layer gets the measured gain first; the cost is a later migration of four steps.

## Tradeoffs considered

- **Keep K11 as the gate:** one build per step, but dogfooding and T10 wait for the largest plan.
- **Drop the work layer:** no migration, but loses the multi-actor goal of 0165.
- **Cost accepted:** T4, T8, T9 and G5 are edited twice.
