---
id: routing-governance-before-cost
title: Routing must restrict candidates to governance-eligible models before comparing cost
status: active
date: 2026-10-04
tags: [model-routing, governance, guardrail]
governed-by: 0018-data-classes-constrain-routing-with-tiered-dlp
grounded-in: [0018-data-classes-constrain-routing-with-tiered-dlp, 0016-quality-gated-cache-aware-model-routing, 0014-local-model-options]
derivation-note: Given data classes are hard constraints (0018) and routing minimizes cost (0016), any cost comparison that includes an ineligible model could select it, so eligibility filtering must come first.
go-getter:
  enforcement:
    - tier: 3
      check: "Routing tests: an ineligible model is never chosen, however cheap; no eligible model routes to a human"
      run: "npm run test:routing"
---

## Guardrail

The router computes the eligible set from the step's data class and the model registry before any cost comparison. With no eligible model it escalates to a human; it never falls back to an ineligible one.
