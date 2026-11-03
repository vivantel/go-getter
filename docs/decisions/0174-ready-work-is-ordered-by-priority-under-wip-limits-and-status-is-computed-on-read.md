---
id: 0174-ready-work-is-ordered-by-priority-under-wip-limits-and-status-is-computed-on-read
title: Ready work is ordered by priority under WIP limits, new units pass an intake approval, and status is computed on read
status: active
date: 2026-11-03
tags: [coordination, roadmap, observability]
track: process
accepted-by: sergemso
---

## Decision

1. **Priority.** A unit has an integer priority, inherited from its parent unless set. `work next` orders ready units by priority, then by the length of the longest dependent chain behind them (the critical path), then by age. Among the first `k` such units (a pack answer, default 5) a worker takes the one picked by a hash of its id, so workers asking at the same time do not all contend for the same claim on the ledger (0166 item 1).
2. **WIP limits.** A limit per worker (default: the `max-concurrent` of 0156) and optionally per feature (a pack answer, default none). `work next` offers nothing above a limit, so one feature cannot starve the others.
3. **Intake.** A new unit enters as `draft`. It becomes `ready` when it parses, declares scope and `Accept` where required (0165, 0172), and is approved. The holder of the parent's claim approves child units within the grant it holds (scope, budget, effects, 0171); the parent's `Owner-id` is asked, as a parked ask (0168), only when a unit exceeds the holder's grant or the parent has no live holder. A unit created by a declared rule (a reading from its meter, 0179; a flake fix, 0175; an incident or recurring unit from an operating charter, 0177; a change request, 0167) is approved by that rule: the rule's declaration is the approval, and the unit still has to fit the grant of the unit it is created under. This is the plan approval of 0155 item 1 applied at each level of delegation, once per unit, not once per run.
4. **Status is computed on read** from claim refs, the tracker and merged state, and never stored in a file. `go-getter work tree` prints the tree with each node's state, the critical path, the units `blocked-by-human` and the units whose lease has lapsed, as text and as JSON.
5. **The decomposition check.** Before a parent's children are approved, siblings' scopes must be disjoint or ordered by `Needs`, each child's `Accept` must be referenced by the parent's `Accept`, and the children's budgets must sum to no more than the parent's.

## Why

With thousands of ready units, "the first step whose Needs are done" is neither fair nor efficient. Priority and the critical path keep the system on what unblocks the most; WIP limits keep one feature from consuming every worker; computing status on read avoids the shared status file that 0166 retires.

## Tradeoffs considered

- **Order by age only:** simple and fair, blind to what blocks other work.
- **Stored roll-ups:** fast to read, but a shared mutable file again.
- **Cost accepted:** `work tree` recomputes from refs and the tracker, so it is slower than reading a file; a read cache with a short life is allowed because it holds no authority.
