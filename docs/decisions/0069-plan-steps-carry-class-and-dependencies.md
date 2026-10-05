---
id: 0069-plan-steps-carry-class-and-dependencies
title: Plan steps declare a task class, dependencies and a check, and go-getter offers the next steps as numbered options
status: active
date: 2026-10-05
tags: [roadmap, model-routing, harness]
track: process
accepted-by: sergemso
fitness-functions:
  - "A test parses every docs/plans file of this repo and rejects an unknown class value, an unknown Needs id or a dependency cycle"
---

## Decision

- Each plan step may carry `Class:` (explore, plan, implement, review or debug; default implement), `Effort:` (low, medium or high), `Tier:` (small, medium or large), `Data:` (a data class, when above internal), `Needs:` (step ids, or `none`) and `Check:` (a command that proves Done-when). The class sets the baseline tier and effort (0061); `Effort:` and `Tier:` override that baseline for one step, up or down, and are written only when the step is harder or easier than its class. A plan never pins a model: the router (0016, 0020) resolves the model from class, tier, data class and cost at run time, and a step's `Data:` and the eligibility filter (0018) still win over any hint.
- Effort is a hint where the host has the lever (fact 0009: no effort control on Gemini CLI, unconfirmed on Copilot); the router reports it as not applied there. Escalation after a failed check moves one tier up (0062) and may also raise effort one level when the step is already at the strongest eligible tier.
- `go-getter plan status|next|start <id>|done <id> [plan]` reads the Markdown plan deterministically. `next` prints at most 4 numbered options, each with step id, title, class, `‖` when it can run in parallel with another option, and its Done-when; the user picks by number or id. `start` sets `[~]` and, on request, creates the worktree (0040); `done` runs the step's `Check` and sets `[x]` only when it passes. The markers are `[ ]`, `[~]`, `[x]`, `[!]` and `[>]` (moved to another plan); step ids are any dotted alphanumeric id, such as `6.2a`.
- The `roadmap` and `refactor-plan` skills write these fields; the `planner` role (0038) reads them.

## Why

A fresh session should be able to continue a plan with one reference, and the model per step should follow from the work rather than from a name that expires.

## Tradeoffs considered

- **Pin a model per step**: explicit, but static role-to-model tiers were rejected in 0016 and price facts expire.
- **Keep free-form plans**: no format work, but continuation and status stay manual and cost tokens each session.
- **Plan state in a database**: queryable, but a plan is a Markdown file by design (roadmap skill) and its history lives in git.
- **Cost accepted**: the plan format becomes a contract the parser enforces; existing plans keep working because every new field is optional.
