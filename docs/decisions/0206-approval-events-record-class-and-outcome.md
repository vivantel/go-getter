---
id: 0206-approval-events-record-class-and-outcome
title: Each point where work waits for a person is an approval event with a class from a fixed table and one of three outcomes
status: draft
date: 2026-11-05
tags: [observability, hooks]
track: process
---

## Decision

1. A point at which work waits for a person (a stop the hook asks about, a parked ask under decision 0155, a release approval) is recorded as a telemetry event `approval` with `action` (the shape of the action), `class` (`irreversible` or `routine`) and `outcome` (`approved`, `rejected` or `timed-out`). Metadata only: no command text, path or reason (decision 0051, guardrail `telemetry-records-metadata-only`).
2. `class` is read from the table in `compiler/src/telemetry/approval-class.mjs` by the action's shape. The model never sets it and the validator refuses a record whose class differs from the table. A shape not in the table counts as `irreversible`.
3. The outcomes `approved`, `rejected` and `timed-out` belong to `approval` events; other events keep their outcomes. `gate:stop` records and their `escalated` outcome are unchanged: they say a person was asked, `approval` says what the person did.
4. The host does not tell the hook how a person answered, so the answer is read from what follows in the same session: the asked call runs (approved), another call comes first (rejected), or nothing happens for 15 minutes (timed-out). Parked asks and typed release approvals are recorded where they are answered or swept.

## Why

The paper needs a dated record of how often and how a person was in the loop. `accepted-by` on decisions and `approvals list` do not show it, and the 15 `escalated` stops of the first five days only say that someone was asked, not whether they approved. The class lets the paper count irreversible approvals apart from routine ones.

## Tradeoffs considered

- **Read `rejected` from the next call:** a heuristic; a parallel tool call in the same session can make an unanswered ask look rejected. Accepted because the host offers no signal, and the error is on the side of counting a stop.
- **Let the model name the class:** rejected; the paper's claim is that the edge does not depend on model judgment.
- **A merge as routine:** rejected by the owner on 2026-11-05. A pull request merge can only be compensated (by a revert that is itself a new change), not undone, so `pr-merge` is `irreversible`. Push, PR create, PR close and comments stay `routine`.
