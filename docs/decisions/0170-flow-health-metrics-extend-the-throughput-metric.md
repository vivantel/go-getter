---
id: 0170-flow-health-metrics-extend-the-throughput-metric
title: Flow-health metrics extend the human-minutes headline; a rising rate is a regression to fix before more gates ship
status: active
date: 2026-11-03
tags: [coordination, observability, cost]
track: process
accepted-by: sergemso
---

## Decision

1. **The headline stays.** Human minutes per merged outcome (0154), floor 5-10x and stretch 50x with quality unchanged. An outcome is a merged unit at any level; the unit's level is recorded.
2. **Flow-health metrics are added**, each computed deterministically from claim refs, the stop and ask logs, the merge queue and CI results, never estimated by an agent, and each with a budget set when the first week of data exists:
   - human wait per parked ask (p50 and p90) and the share of unit time spent `blocked-by-human`;
   - go-getter approval prompts per merged unit (0159's budget, generalised from per merged PR);
   - claim conflicts, scope violations and change requests per 100 units;
   - rework: units returned by the merge queue or by acceptance, per 100 merged;
   - lease expiries and quarantined units (0173);
   - flake rate of required checks (0175);
   - validation escapes: defects found at a higher level (0172) per 100 merged units at the level below.
3. **A regression stops new gates.** A week in which prompts per merged unit, human wait or escapes rise is fixed before another gate ships (as 0159 item 5).
4. `go-getter metrics day` keeps its output; `metrics flow` (work-coordination K14) adds the above.

It extends 0154 and generalises 0159 item 5; it changes neither.

## Why

At scale the owner's minutes are no longer the only bottleneck: a queue, a flaky test or a slow approver can stall many units while each human minute stays low. Without flow metrics the problems this reframing is meant to minimise could not be seen.

## Tradeoffs considered

- **Units merged per day:** visible, but rewards thin slicing and hides human load and rework.
- **Keep 0154 and 0159 alone:** cheaper, but blocking, queue delay and conflicts go unmeasured.
