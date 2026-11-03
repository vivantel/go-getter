---
id: 0042-the-framework-map
title: The framework's entities, how they relate, and which part owns each artifact
status: active
date: 2026-11-03
tags: [coordination, outcomes, architecture]
kind: decision
governed-by: 0177-each-part-of-the-framework-owns-one-artifact-and-one-kind-of-decision
---

States the vocabulary of decisions 0165-0181 once. If this fact and a decision disagree, the decision wins and this fact is corrected.

**Entities**

| Term | Kind | What it is | Lives in |
|---|---|---|---|
| Worker | actor | A human, agent or CI job that pulls units and holds claims; it has capability tags | named by a claim; listed in `docs/workers.md` when it uses the tracker front door |
| Unit | work contract | One shape at every level (0165) | a plan file, a claim ref, a tracker issue |
| Product, feature, plan, step | unit levels | Labels on units: a feature is one file under `docs/plans/`, a phase of it is a plan, a plan's checklist items are steps | `docs/plans/` |
| Roadmap | skill and index | The `/roadmap` skill (decompose) and `docs/plans/roadmap.md` (the product index); not an artifact type | `src/skills/roadmap/`, `docs/plans/roadmap.md` |
| Outcome brief | artifact | Hypothesis, meters, target, window, attribution, budget, caps (0178) | `docs/outcomes/<id>.md` |
| Meter | artifact | An instrument: source, refresh rate, cost, noise (0179) | `docs/meters/<id>.md` |
| Reading | datum and unit | One measurement; a `measure` unit any capable worker claims | `refs/go-getter/readings/<meter>/<period>`, git refs outside the working tree |
| Operating charter | artifact | What is live, owner, health meters and thresholds, escalation, retirement (0177) | `docs/operations/<id>.md` |
| Incident unit, recurring unit | units | Unscheduled work from a crossed threshold; scheduled maintenance | plans, under the outcome that needs them |
| Grant | authority | A subset of the parent's: scope, spend, command shapes, asks, data classes, effects with caps (0171, 0180) | per-user store outside git |
| Knowledge artifacts | decisions, facts, guardrails, procedures | What `/roadmap` and `capture` produce | `docs/{decisions,facts,guardrails,skills}/` |

**Relations:** an outcome names one or more meters, and a meter can serve several outcomes. An outcome is served by one or more features, whose outcome-tier `Accept` points at it (0172). A feature has plans, a plan has steps. A unit has zero or one live claim, and a claim has one holder. A unit has one grant. A scheduled meter creates reading units over time. An operating charter serves one outcome and names the meters it watches.

**Ownership** (O owns, W writes into it, R reads, - none)

| Artifact | Discover | Decompose | Deliver | Measure | Operate |
|---|---|---|---|---|---|
| Outcome brief | O | R | R | R | R |
| Evidence facts | O | R | W via `capture` | W readings summary | W |
| Unit tree, plans, scope, grants | R | O | R | - | W incident and recurring units |
| Unit state: claim, lifecycle, acceptance | - | R | O | R | R |
| Meter | R | R | - | O | R |
| Reading | R | - | - | O | R |
| Outcome acceptance verdict | R | R | O, run by a non-author worker over readings supplied by Measure | R | R |
| Operating charter | R | R | R | R | O |
| Decisions, guardrails, procedures | W | O | R | R | R |

A cell that has no owner, or two, is a defect in decision 0177.
