---
id: 0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops
title: An autonomous run is a plan range the operator starts, with approve-once for outward commands, preconditions checked at use and bounded stops
status: active
date: 2026-10-11
tags: [hooks, enforcement, roadmap, practice-packs]
track: product
accepted-by: sergemso
---

## Decision

The L.8 interview (2026-10-11) settled the autonomous run contract. It is a profile over `hitl`, `cost-routing` and `orchestration` (0129) plus the rules below, not a flag that bypasses gates. It extends the approval model of 0126 and the free commands of 0127.

1. **Starting a run is the human act.** `go-getter run <plan> [--through N]` writes a run record per user, outside git and per project: the plan, the step range, the start time, the caps and the granted shapes. The hook reads it; an agent cannot write or edit it (same protection as the approvals store). It ends with the run or at a timeout.
2. **Approve-once per command shape.** An outward command is a catalog id (`pr-create`, `pr-merge`, `pr-close`, a plain push). Its first use asks at the host prompt where the hook can ask (Claude Code) and is then remembered per user and project until revoked. In a run, the record is the approval on every host: no prompt is needed, so unattended runs work wherever the hook runs.
3. **Preconditions are checked at each use**, not once: for `pr-merge`, the required checks are green, the base is the default branch, and the pull request belongs to a step in the run's range. A failed precondition asks again or stops the run.
4. **Always human, never granted by a run or a remembered approval:** force-push, history rewrite and deleting a shared branch; changes to repository settings or branch protection; tags, releases and publishing (an explicit go-ahead in the session, as today).
5. **Tracker writes in a run:** `comment` and `close` on the run's own plan steps are free; `create` still asks (0124).
6. **The run stops and hands over** when the spend cap is reached (the `cost-routing` answer) or when a step needs a human (marked `Human: <reason>` in the plan, or blocked: an owner, an interview, an ambiguous done-when); it never skips such a step silently. Spend is read from the telemetry metadata log, so `go-getter run start` refuses while a cap is set and `telemetry-recording` is not `metadata-log`.
7. **Red CI:** fix and retry up to two attempts per step, then stop; a red pull request is never merged.
8. **A guardrail denial** is recorded. The agent may take another permitted route but never works around the guardrail; a repeated denial on the same step stops the run.
9. **A report** ends every run: steps done, pull requests merged and issues closed with links; stops, denials and skipped steps with reasons; spend and approvals used. It is posted as a comment on the plan's issue after the secret and personal-data check.

## Why

About twenty "yes" confirmations in one session on steps whose order was already fixed (L.8 evidence) are friction without protection when branch protection, required checks and the plan already bound the work. The owner wants those confirmations replaced by one deliberate act at the start, with the dangerous actions (history, settings, releases) left out of reach. Checking preconditions at each use keeps a remembered approval from outliving the conditions that made it safe.

## Tradeoffs considered

- **A per-run grant only (nothing remembered):** safest, but every run re-grants what a person approved yesterday.
- **A committed run file:** reviewable, but an agent could edit it, so it cannot carry authority.
- **A time or spend budget without a plan range:** weaker link between a grant and the work it covers.
- **Releases approvable once:** fewer stops, but publishing is outward and hard to reverse; the owner kept the session go-ahead.
- **Stopping at the first red CI or denial:** simpler, but gives up the cheap recoveries a bounded retry and a permitted alternative provide.
- **Cost accepted:** a new per-user store and command, a precondition check per shape (needs the GitHub CLI for merge checks), and unattended runs on hosts other than Claude Code rest on the run record alone.
