---
id: 0086-calibration-proposals-take-effect-when-activated
title: Routing calibration proposals are draft decisions whose data routing reads only once a human activates them
status: active
date: 2026-10-06
tags: [model-routing, cost, observability]
track: product
accepted-by: sergemso
governed-facts: [0025-routing-runtime]
---

## Decision

Drafted by an agent while the owner was away (plan step C.1); awaiting sign-off.

`go-getter routing calibrate` (0017) writes measured failure rates per tier and step shape as a `draft` decision carrying `go-getter.routing-calibration`, superseding the active one; routing uses them only when a human sets it `active`. Idle advice is a line of that proposal, citing withdrawn decision 0074 when keep-warm would have paid, not a `route --idle` answer.

## Why

0017 forbids silent changes; reusing decision status as the approval needs no new mechanism, and 0074 was withdrawn until telemetry shows cold restarts are costly.

## Tradeoffs considered

- **Separate calibration file**: decoupled from the knowledge base, but an approval outside it is invisible to `conform` and `lint`.
- **Cost accepted**: routing stays on defaults until someone reviews a draft.
