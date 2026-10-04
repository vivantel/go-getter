---
id: telemetry-records-metadata-only
title: Telemetry must record metadata only, never prompt or file content
status: active
date: 2026-10-04
tags: [observability, governance, security, guardrail]
governed-by: 0018-data-classes-constrain-routing-with-tiered-dlp
grounded-in: [0018-data-classes-constrain-routing-with-tiered-dlp, 0017-routing-calibration-from-verification-and-telemetry]
derivation-note: Given calibration needs per-step telemetry (0017) and DLP forbids data leaving its class boundary (0018), telemetry may hold only metadata, or it would become a leak channel.
go-getter:
  enforcement:
    - tier: 3
      check: "The telemetry record schema allows only metadata fields (model, effort, token counts by cache state, cost, task class, outcome, escalations, timestamps) and rejects any other field"
      run: "npm run test:telemetry"
---

## Guardrail

Telemetry records carry metadata only — no prompts, completions, file contents or tool output — and live in gitignored `.go-getter/state/`.
