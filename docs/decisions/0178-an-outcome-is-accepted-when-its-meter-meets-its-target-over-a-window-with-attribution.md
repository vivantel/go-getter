---
id: 0178-an-outcome-is-accepted-when-its-meter-meets-its-target-over-a-window-with-attribution
title: An outcome is accepted when its meter meets the target over a window and the attribution method holds
status: active
date: 2026-11-03
tags: [coordination, verification, roadmap]
track: product
accepted-by: sergemso
---

## Decision

1. **The outcome brief** is the artifact discover owns (0177). It names: the hypothesis (what we expect to change and why); the meter or meters (0179); the target; the observation window; the **attribution method** (how the effect is isolated from other causes: a holdout, a before and after window, a control group); the constraints; the budget and the effect caps (0180); the review cadence; and the evidence so far. A brief without an attribution method cannot be approved.
2. **Approval** is by a human for a root outcome and by the grant holder for a sub-outcome (0171); it is a parked ask (0168).
3. **Acceptance.** An outcome is accepted when readings over its window meet the target and its attribution method held (the holdout stayed separate, the baseline was stable). The check runs under a worker other than the author (0172, outcome tier).
4. **A slow meter parks the unit on time,** not on a human: its claim is in the non-expiring `parked` state (0166) with reason `awaiting-window` and a wake date, it releases its worker, and it does not count as `blocked-by-human` (0168, 0170).
5. **Failure is information.** A missed target or a broken attribution does not fail the delivery units; it re-opens the outcome in discover, which may keep, change or drop the hypothesis. The units' own acceptance (0172 lower tiers) stands.
6. **Slice outcomes where possible.** A brief should name an early meter with a short window beside the final one, so a wrong direction shows before the long window ends.

## In force

This decision takes effect with D4 (acceptance by meter). Until then the existing practice applies.

## Why

A metric moving does not prove a change moved it. Requiring the attribution method up front, and a window, turns a reading into evidence, at the cost of design effort and waiting that a target-only rule skips.

## Tradeoffs considered

- **Target reading only:** cheap and fast, but noise and coincidence pass as success.
- **Human judgment on the data:** flexible, but puts a human on every outcome and recreates the waits this design removes.
- **Cost accepted:** each outcome costs design effort and wall-clock time; some outcomes (long windows, rare events) cannot be accepted quickly, and the brief must say so.
