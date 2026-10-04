---
id: 0016-quality-gated-cache-aware-model-routing
title: Model routing is a quality-gated cascade that minimizes expected total step cost, cache effects included
status: active
date: 2026-10-04
tags: [model-routing, cost, harness, verification]
track: product
accepted-by: sergemso
fitness-functions:
  - Routing unit tests include a case where a warm-cache larger model beats a cold-cache cheaper model
---

## Decision

The cost & routing harness pack (component 11) routes every agent step as follows:

1. **Task classes** (e.g. explore, plan, implement, review, debug — customizable) each carry a required quality bar, expressed as verification checks (0017).
2. **Eligibility first**: only models the data class of the step's data allows are candidates (0018).
3. **Cheapest sufficient tier**: among eligible (model, effort) tiers, pick the one with minimal *expected total step cost* that is expected to meet the bar.
4. **Expected total step cost** = input tokens priced by cache state (cache read / cache write / uncached) + output tokens + the handoff cost of moving work to another model or agent (re-sent context, cold cache) + expected escalation cost (failure probability × cost of redoing at the next tier). Per-token list price alone is never the criterion: staying in a warm-cache session on a pricier model can be cheaper than delegating to a cheaper one.
5. **Verification gates** every routed result; on failure, escalate one tier; escalation is bounded, then a human decides.

The policy compiles into host mechanisms — per-agent model and effort settings (0014), delegation rules, and possibly a helper the orchestrating agent can query. The exact runtime mechanism is fixed by a later decision once host capabilities are known (plan phase 1).

## Why

The user requires the required quality level at minimal token spend, and pointed out that caching can make a more expensive model the cheaper choice.

## Tradeoffs considered

- **Static role → model tiers**: simple and predictable, but no escalation or learning; overspends or under-delivers.
- **External routing proxy**: finest-grained, but it is an own-runtime component (rejected in 0015) and some hosts cannot use a proxy.
- **Cost accepted**: needs per-provider pricing including cache pricing (facts), verification signals and telemetry; estimates are approximate until calibrated (0017).
