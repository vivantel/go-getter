---
id: 0177-each-part-of-the-framework-owns-one-artifact-and-one-kind-of-decision
title: Discover, decompose, deliver, measure and operate each own one artifact and one kind of decision
status: active
date: 2026-11-03
tags: [coordination, roadmap, architecture]
track: product
accepted-by: sergemso
---

## Decision

The framework has five parts, split by what each owns, not by when it runs. Activities may loop and overlap (discovery can continue during delivery); ownership never changes.

| Part | Skill / verbs | Owns (artifact) | Decides | Answers |
|---|---|---|---|---|
| Discover | `/discover` (new) | the outcome brief (0178) and the evidence behind it | whether an outcome is worth pursuing and how success is read | What is worth achieving, and how will we know? |
| Decompose | `/roadmap` today (name kept; `decompose` is its description) | the unit tree: plans, scope, `Accept`, grants (0165, 0171) | how an accepted outcome splits into units | How do we split it? |
| Deliver | `go-getter work …` and `queue …` (0169) | unit state: claim, lifecycle, acceptance (0166, 0172, 0173) | whether a unit is done | Is it done? |
| Measure | `go-getter measure …` (0179) | meters and readings | what a reading says, as data | Did it work? |
| Operate | none yet (defined, not built) | the operating charter: what is live, its owner, health meters and thresholds, escalation, retirement | whether to intervene, escalate or retire what is live | Is it still running well, and is it still worth keeping? |

1. **Handoffs.** Discover to decompose: an outcome brief approved by a human for a root outcome, or by the grant holder for a sub-outcome (0178 item 2), as a parked ask (0168). Decompose to deliver: units approved by their parent's owner (0174). Deliver to discover: facts learned, and a falsified hypothesis raised as an ask. Measure to discover and decompose: readings, which confirm and accept an outcome (0178), open a new hypothesis, or cancel or supersede units (0173).
2. **Meter is an instrument, not a stage.** Taking a reading is a `measure` unit, claimed by any worker with the capability (0181); interpreting readings belongs to discover.
3. **Operate** runs what delivery produced, at any scale: a deployed service or a published package has the same need as an industry, and the cost of having no owner grows with the number of things live. Delivery ends when a unit is accepted; operation begins when the thing is live behind no flag (0175). Measure supplies the readings; operate owns the thresholds and what happens when one is crossed, by creating **incident units** (unscheduled, from a crossed threshold) and **recurring units** (scheduled maintenance) under the outcome that needs them. Operate is defined now and built when the first non-software dogfood (discovery-and-outcomes D9) or real use shows what is missing: no skill, verb or check exists for it yet beyond the charter format (discovery-and-outcomes D7a).
4. **One question, one owner.** When two parts seem to decide the same thing, this table decides; a conflict between them is a defect in this decision, fixed by amending it.

## Why

The three-stage split alone left the meter overlapping delivery and discovery and left no place for running a thing. A cut by artifact and authority gives each artifact one owner and each decision one place, while the loop between parts stays free.

## Tradeoffs considered

- **A strict one-way pipeline:** simple to audit, but a falsified hypothesis restarts everything and every loop pays handoff latency.
- **No fixed split:** flexible, but ownership of an outcome brief or a reading stays ambiguous.
- **Cost accepted:** `/roadmap` is narrowed to decomposition and its skill text changes (discovery-and-outcomes D6); the name is kept for installed plugins and archived plans.
