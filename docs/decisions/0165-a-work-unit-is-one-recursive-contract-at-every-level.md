---
id: 0165-a-work-unit-is-one-recursive-contract-at-every-level
title: A work unit is one recursive contract at every level of product > feature > plan > step; a plan is the default unit of delegation
status: active
date: 2026-11-03
tags: [coordination, roadmap, architecture]
track: product
accepted-by: sergemso
---

## Decision

go-getter coordinates humans and agents through **work units**. One unit shape serves every level; the level (product, feature, plan, step) is a label, not a type.

1. **The contract.** A unit has a brief (context and what to do), a `Done-when` check, an `Accept` run by someone other than its author (0172) that is a command, a meter reading over a window (0178) or a named human review, a `Scope` (the exclusive resources it may change: paths, interfaces, shared artifacts, and in other domains accounts, places or budget lines, 0167), an `Owner` kind (`human`, `agent` or `either`) with the capability tags it needs (0181), a `Parent`, an `Owner-id` (the accountable person or role: inherited from the parent, and for the root the human who started it), `Needs`, a `Budget` (spend and time), a `Priority` (0174), an optional `Flag` (0175) and a brief version (0173). The existing plan step format (0069) is a valid unit; every new field is optional with a default, so current plans parse unchanged.
2. **Delegation is claiming plus decomposing.** Whoever claims a unit (0166) may split it into child units and delegate those under the same rules at any depth. The default thing a person or agent is handed is a **plan** (what `roadmap` produces); steps stay the plan's internal checklist and are not claimed separately unless the plan is split.
3. **A feature is a set of plans** with one owner, one `Accept` and, where its behaviour ships partially, one flag. A product is the root. A project that skips a level (a bug fix has no feature) simply omits the parent.
4. **Ids and headers.** A unit's id is `<file-stem>#<local-id>`: `work-coordination#K2` for a step, `work-coordination#A` for a plan. A plan (a `##` phase) and a feature (the part of a file before its first phase) carry the same fields as a step in a header block of `Key: value` lines directly under the heading, with `Id:` required for a plan to be claimable; a feature's id is its file stem. A plan without a header is not claimable, but its steps are, so existing plans parse and run unchanged. A plan split out into its own file becomes feature-shaped: its header carries `Parent: <feature-stem>#<phase-id>` and its id is its own file stem. A claim covers its unit's subtree (0166) and is recorded in the claims ledger under its unit id (0166 item 1).
5. **Files.** A feature is one file under `docs/plans/`; each phase of it is a plan (a self-contained, delegable checklist of steps); the product index is `docs/plans/roadmap.md`. A plan that grows past one owner's reach is split out into its own file and referenced from its feature. The index holds no step state (0166). A fact (`0042-the-framework-map`) lists every entity and who owns it.

It extends 0069 (step format) and the hierarchy line of 0117, which said a work source may later declare a hierarchy: the hierarchy now lives in the unit contract, and a source only mirrors it. Decision 0001's scope is unchanged: go-getter coordinates by configuring host agents and by a protocol (0169), and owns no runtime (0015).

## Why

The reframing target is thousands of units worked in parallel by humans and agents, alone and together. Delegating at plan level (the output of one `roadmap` session) cuts coordination traffic by the number of steps per plan, and a recursive contract lets a feature owner, human or agent, hand plans on without a second tooling path per level.

## Tradeoffs considered

- **Typed levels with separate formats:** readable, but four formats to keep consistent, and a team that skips a level fights the model.
- **Plans only, features as grouping tags:** smallest change, but a feature cannot be delegated to one owner who decomposes it.
- **Cost accepted:** the plan parser and `go-getter plan` generalise (work-coordination K1) instead of staying fixed, and a unit with an undeclared scope falls back to the path names in its `Do` text.
