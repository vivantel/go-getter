---
id: routing-escalation-bounded
title: Routing escalation must be bounded and end at a human
status: active
date: 2026-10-04
tags: [model-routing, cost, guardrail]
governed-by: 0016-quality-gated-cache-aware-model-routing
grounded-in: [0016-quality-gated-cache-aware-model-routing]
derivation-note: Given verification-gated escalation (0016), an unbounded retry loop could burn unlimited tokens, so escalation needs a hard bound with human handoff.
go-getter:
  enforcement:
    - tier: 3
      check: "Routing tests: after the policy's maximum escalations a step is handed to a human, never retried further"
      run: "npm run test:routing"
---

## Guardrail

A routing policy declares a maximum number of escalations per step. When it is reached, the step stops and goes to a human.
