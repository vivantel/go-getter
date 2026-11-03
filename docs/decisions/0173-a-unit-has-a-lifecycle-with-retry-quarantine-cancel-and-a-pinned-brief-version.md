---
id: 0173-a-unit-has-a-lifecycle-with-retry-quarantine-cancel-and-a-pinned-brief-version
title: A unit has a lifecycle with lease reclaim, a retry budget, quarantine, cancel and supersede, and a claim pins the brief version
status: active
date: 2026-11-03
tags: [coordination, roadmap, harness]
track: process
accepted-by: sergemso
---

## Decision

1. **States:** `draft`, `ready`, `claimed`, `parked` (0168), `in-review` (acceptance, 0172), `done`, and the exits `blocked`, `quarantined`, `cancelled`, `superseded`. A parent's state is computed from its children (0174).
2. **Lease expiry reclaims.** When the lease of a leaf unit that is not parked lapses (a parent with live children and a parked unit never lapse, 0166) the unit returns to `ready`; the next claimant starts from the previous claimant's last checkpoint (the hidden refs of the checkpointing pack) and branch, not from nothing.
3. **Retry budget and quarantine.** A step may fail twice under one claim (0130 item 7); a unit may pass through three claimants. After that it is `quarantined`: out of `work next`, escalated as an ask to the parent's owner (0168), and never retried silently.
4. **Cancel cascades.** Cancelling a unit cancels its unmerged descendants: their claims are released and their open branches closed. Merged work stays; undoing it needs a new unit (a revert), never a history rewrite.
5. **Supersede links.** A unit made obsolete names its successor; open claims on it are released with that pointer.
6. **The brief is versioned.** A claim pins the brief version (a content hash). A change to the brief bumps the version; at its next heartbeat a worker on an older version learns of it and must re-read the brief before continuing, or release the unit. Work already merged stays valid unless acceptance fails.
7. **A repeated guardrail denial on one unit** stops that unit (0130 item 8) and parks it with the denial recorded.

It generalises the run stops of 0130 from a per-run rule to a per-unit one.

## Why

At thousands of units, crashed workers, failing units and changed requirements are routine. Without defined states, a lapsed lease loses work, a failing unit loops, a cancelled feature leaves children running, and children work from a stale brief.

## Tradeoffs considered

- **Leave recovery to the operator:** nothing to build; every incident is a human task, against the goal.
- **Cost accepted:** a state machine and a hash per brief; a wrong cancel needs a revert unit to undo.
