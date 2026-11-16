---
id: draft-plan-autonomy
title: Autonomy is a property of an approved plan, started and stopped with plan commands; go-getter run is a deprecated alias
status: draft
date: 2026-11-16
tags: [coordination, hooks, enforcement]
track: process
---

## Decision

Pending the owner's acceptance. Supersedes 0130's command surface (not its stops, bounds or grant model), and amends 0186 and 0203 only in the spelling of the commands they name.

1. **One surface.** `go-getter plan start --auto [plan] [--through N] [--hours H] [--grant <id>]...` starts an autonomous range on an approved plan, `plan next --auto [--json]` hands the agent the next step or a stop, `plan attempt <id>` records a failed fix attempt, `plan stop` ends the run and posts its report, and `plan status` shows the active run. `plan start <id>` (one step by hand) is unchanged.
2. **Same mechanism.** These forward to the run record of 0130; the stops (`spend-cap`, `human-needed`, `red-attempts`, `repeated-denial`, `needs-open`), the bounds, the approval of 0186 and the report are unchanged.
3. **Person-only acts stay person-only.** The pre-tool hook refuses an agent's `plan stop` and `plan start --auto --grant ...` exactly as it refuses `run end` and `run start --grant`; an agent's `plan start --auto` passes only as one plain command on an approved plan in `docs/plans`.
4. **`go-getter run` stays one release as a deprecated alias** that prints a notice on stderr and behaves as before, so installed hooks, skills and docs keep working. It is removed in the release after.
5. **The `autonomous-run` skill keeps its name** (renaming it ripples through every host output) and follows the plan spellings.

## Why

Two commands over one file made `plan` and `run` look like two modes with a shared `next`. An approved plan is already what authorises autonomy (0186); a second noun added nothing but confusion.

## Tradeoffs considered

- **Make plain `plan start` autonomous**: matches "each start is autonomous" literally, but `plan start <id>` creates a worktree for one step and is used by hand; an explicit `--auto` keeps the hook's person-only rules decidable on the command line.
- **Carry the bounds on `plan approve`**: one decision point, but approval is stored outside the repository and the bounds are per start; kept on `start`.
- **Remove `run` at once**: simplest, but breaks installed hooks and the INSTALLING text.
- **Cost accepted**: two spellings for one release.
