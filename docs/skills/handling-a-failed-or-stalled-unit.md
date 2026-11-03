---
id: handling-a-failed-or-stalled-unit
title: Recover a unit whose lease lapsed, that keeps failing or whose brief changed
status: draft
date: 2026-11-03
tags: [coordination, roadmap, procedural]
operationalizes: [work-only-under-a-live-claim]
---

## Procedure

1. `go-getter work tree` shows lapsed leases, quarantined units and units `blocked-by-human`.
2. **Lapsed lease:** the unit is already `ready`; the next claimant resumes from the last checkpoint and branch. Do nothing unless it keeps lapsing.
3. **Quarantined (three claimants or repeated failure):** read the evidence on the escalated ask, then split it, fix its brief, raise its budget or cancel it. Do not retry unchanged.
4. **Brief changed:** a worker on an older version is told at its next heartbeat; confirm it re-read the brief or released the unit.
5. **Cancel:** cancelling cascades to unmerged descendants. To undo merged work, create a revert unit; never rewrite history.
6. **Supersede:** name the successor so claims on the old unit are released with a pointer.
7. If a failure shows a gap in a gate, add a check, guardrail or reviewer instruction before the next run (0158 item 3).
