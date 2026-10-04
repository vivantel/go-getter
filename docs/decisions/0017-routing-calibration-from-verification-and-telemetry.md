---
id: 0017-routing-calibration-from-verification-and-telemetry
title: Routing quality bars and tiers are calibrated from verification signals and outcome telemetry
status: active
date: 2026-10-04
tags: [model-routing, observability, verification, cost]
track: product
accepted-by: sergemso
---

## Decision

- A task class's quality bar is a set of objective checks: tests pass, lint/typecheck clean, reviewer-agent verdict, no human rework.
- go-getter ships sensible default tiers per class. Every routed step records metadata — model, effort, tokens by cache state, cost, verification outcome, escalations — in `.go-getter/state/` (metadata only, per 0018).
- `go-getter routing calibrate` reruns the cost model (0016) on that data and proposes policy changes as kms decisions. It never applies changes silently.

The default policy and verification gate ship in v0.1; the calibration loop ships in v0.2 (0004).

## Why

Measuring on the project's real work is the only way to keep "minimal spend at required quality" true over time as models, prices and the codebase change.

## Tradeoffs considered

- **Offline eval suite per project**: precise up front, but costly to run and sample tasks may not reflect real work. May be offered later as an optional bootstrap.
- **User-declared tiers only**: cheapest to build, but guesswork that never improves.
- **Cost accepted**: depends on the telemetry and verification components; early policies run on defaults.
