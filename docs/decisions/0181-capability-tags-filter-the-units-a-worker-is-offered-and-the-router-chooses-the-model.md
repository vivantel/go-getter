---
id: 0181-capability-tags-filter-the-units-a-worker-is-offered-and-the-router-chooses-the-model
title: Capability tags filter the units a worker is offered, and the router still chooses model and effort
status: active
date: 2026-11-03
tags: [coordination, model-routing, agent-roles]
track: process
accepted-by: sergemso
---

## Decision

1. **Tags are hard requirements.** A unit lists `Needs-capability` tags (for example `manipulator`, `legal-review`, `browser`, `vision`). A worker declares the tags it has when it calls `work next`, and only units whose tags it holds are offered (0169, 0174). Tags come from a project vocabulary file in the style of `docs/skills/tags.md`; an unknown tag is refused when a unit is approved.
2. **The router stays in charge of model and effort.** `Class`, `Effort`, `Tier` and `Data` (0069) remain the router's inputs; a unit never names a model. A tag that is a model or host property (`vision`, `long-context`, `tool-use`) restricts the router's eligible set before cost is compared, the order fixed by `routing-governance-before-cost` and `routing-uses-total-step-cost`.
3. **A worker advertises what it can do, not which model it will use.** The worker's router picks within the tags.
4. **`Owner` still says who may do it** (`human`, `agent`, `either`); tags say what they need.

## Why

One pull protocol should serve people, agents and robots. A hard filter prevents a worker from claiming a unit it cannot do, which wastes claims at scale, and keeping model choice in the router preserves cost routing and the rule that plans never name a model.

## Tradeoffs considered

- **Tags carrying a model preference:** simpler for a worker to self-select, but puts model names in plans and bypasses total-step-cost routing.
- **Keep human, agent, either:** no new field, but capability then lives in prose and wrong claims grow with unit count.
- **Named pools per capability:** clear quotas, but static structure, and a unit needing two capabilities fits badly.
- **Cost accepted:** a vocabulary to maintain, and a worker's tag list must be honest; the claim check cannot prove a worker has a capability.
