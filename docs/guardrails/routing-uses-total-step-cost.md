---
id: routing-uses-total-step-cost
title: Routing must compare expected total step cost, never per-token list price
status: active
date: 2026-10-04
tags: [model-routing, cost, guardrail]
governed-by: 0016-quality-gated-cache-aware-model-routing
grounded-in: [0016-quality-gated-cache-aware-model-routing]
derivation-note: Given 0016 defines cost as expected total step cost including cache state, handoff and escalation, comparing list prices alone would systematically pick wrongly when caching or delegation dominate.
go-getter:
  enforcement:
    - tier: 3
      check: "Cost-model tests cover cache read/write/uncached pricing, handoff cost and escalation cost, incl. a warm-cache larger model beating a cold-cache cheaper one"
      run: "npm run test:routing"
---

## Guardrail

Every routing comparison uses expected total step cost: input by cache state, output, handoff of context to another model or agent, and expected escalation.
