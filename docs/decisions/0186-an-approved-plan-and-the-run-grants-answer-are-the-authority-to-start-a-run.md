---
id: 0186-an-approved-plan-and-the-run-grants-answer-are-the-authority-to-start-a-run
title: An approved plan and the run-grants answer are the authority to start a run; starting is free
status: draft
date: 2026-11-04
tags: [hooks, enforcement, roadmap]
track: product
---

## Decision

Draft, for the owner's sign-off. It amends item 1 of 0130 ("starting a run is the human act") and replaces the "a person confirms the start" parts of drafts 0137 and 0184. Effects are gated, not starting.

1. **The human act is approving the plan, once.** `go-getter plan approve <plan>` (0155 item 1) writes an `**Approval**: approved <date> by <name>` line. On a plan that has no Approval line (written by hand, before drafting existed) it adds the line; it is the owner's explicit act and stays human-only.
2. **An agent may start a run on an approved plan.** The pre-tool hook allows `go-getter run start <plan> [--through N] [--hours H]` when the plan is a file in `docs/plans` whose Approval line says approved, the call is one plain command (no chain, quote, redirection or substitution) and it carries no other flag. Everything else stays denied, with a message that says what the person does: approve the plan, or run the command themselves.
3. **The CLI makes the record, never wider than its sources.** The run record holds the plan, the range, the time limit, the spend cap, and the grants of the project's `run-grants` answer, plus the plan's approval text. An agent cannot pass `--grant`. A person's own `run start` keeps `--grant`, which can only name approvable shapes (0171: grants only narrow; 0130 item 4 excludes force-push, history rewrite, settings, tags and releases).
4. **Bounds stay.** A run has a time limit (default 8 hours, at most 72), refuses to start while a spend cap is set and spend is not recorded (0130 item 6), refuses a plan whose approval is pending, and every outward use is checked against its preconditions (0130 item 3).
5. **Human-only stays human-only:** `--grant`, `approvals *`, `plan approve`, `run end`, releases and tags. The run record stays unwritable by an agent: only the CLI writes it, and the hook denies any call that opens the store.
6. **Hosts without a blocking hook** enforce nothing for any rule, as today; hosts whose hook cannot ask need no prompt because none is used.

## Why

A human-only start serializes every actor behind one person, which contradicts many humans and agents working in parallel (0165, 0169) and 0155 (human attention goes to plan approval, ask-triggers and batched releases). The authority a run grants already comes from two sources the owner controls: the approved plan and the `run-grants` answer. Starting or claiming work adds no authority of its own, so it needs no gate.

## Tradeoffs considered

- **Human-only start (0130 as is):** safest for the start itself, but one person starts every run, so throughput is bounded by that person; nothing it protects is not already bounded by the plan approval and grants.
- **A confirmation prompt (0137):** keeps a human act, but only where the host can ask, and a prompt-injected agent can still put a run in front of a person who confirms by habit.
- **Reading the person's request from the host transcript (0184):** no prompt needed, but it works only where a transcript exists and a forged line defeats it.
- **This decision:** no per-run act, no host dependence, and the approval is a durable, reviewable line in the plan.
- **Cost accepted:** the Approval line is a text line in a file an agent can edit, so a prompt-injected agent that edits a plan to say approved can then start a run within the grants (git-push, pr-create, pr-merge, pr-close; green checks, default branch and range preconditions still apply). Follow-ups to close that: a pre-tool rule against an agent adding an Approval line, or requiring the approval on the default branch. Plans with no Approval line still need a person to start a run or to approve the plan.
