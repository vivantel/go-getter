---
id: 0186-an-approved-plan-and-the-run-grants-answer-are-the-authority-to-start-a-run
title: An approved plan and the run-grants answer are the authority to start a run; starting is free
status: active
date: 2026-11-04
tags: [hooks, enforcement, roadmap]
track: product
---

## Decision

Accepted by the owner 2026-11-04. It amends item 1 of 0130 ("starting a run is the human act") and replaces the "a person confirms the start" parts of drafts 0137 and 0184. Effects are gated, not starting.

1. **The human act is approving the plan, once, and the approval is a record in the per-user store.** `go-getter plan approve <plan>` (0155 item 1) writes an entry in the protected per-user directory that already holds the approvals and the run record (an agent cannot write or open it): keyed by the project and the plan's project-relative path, with a hash per step of its Do, Done-when and Check text, the set of step ids, the approver and the date. It also writes the visible `**Approval**:` line (adding it to a plan that has none), as a note for readers only: the line is never the authority, since an agent can edit a tracked file. A step's marker, Progress and Result lines are not hashed, so finishing a step keeps the approval; changing a step's Do, Done-when or Check, or adding a step, makes it out of date until a person approves again, and the refusal names the changed steps. A plan approved only by an Approval line (T9 drafts) has no entry and needs approving again.
2. **An agent may start a run on an approved plan.** The pre-tool hook allows `go-getter run start <plan> [--through N] [--hours H]` when the plan is a file in `docs/plans` with a current store entry, the call is one plain command (no chain, quote, redirection or substitution) and it carries no other flag. Everything else stays denied, with a message that says what the person does: approve the plan, or run the command themselves.
3. **The CLI makes the record, never wider than its sources.** The run record holds the plan, the range, the time limit, the spend cap, and the grants of the project's `run-grants` answer, plus the id (a hash) of the plan approval it was started under. An agent cannot pass `--grant`. A person's own `run start` keeps `--grant`, which can only name approvable shapes (0171: grants only narrow; 0130 item 4 excludes force-push, history rewrite, settings, tags and releases).
4. **Bounds stay.** A run has a time limit (default 8 hours, at most 72), refuses to start while a spend cap is set and spend is not recorded (0130 item 6), refuses a plan that needs approval and has no current entry (`plan start` and `run next` do the same), and every outward use is checked against its preconditions (0130 item 3).
5. **Human-only stays human-only:** `--grant`, `approvals *`, `plan approve`, `run end`, releases and tags. The run record stays unwritable by an agent: only the CLI writes it, and the hook denies any call that opens the store.
6. **Hosts without a blocking hook** enforce nothing for any rule, as today; hosts whose hook cannot ask need no prompt because none is used.

## Why

A human-only start serializes every actor behind one person, which contradicts many humans and agents working in parallel (0165, 0169) and 0155 (human attention goes to plan approval, ask-triggers and batched releases). The authority a run grants already comes from two sources the owner controls: the approved plan and the `run-grants` answer. Starting or claiming work adds no authority of its own, so it needs no gate.

## Tradeoffs considered

- **Human-only start (0130 as is):** safest for the start itself, but one person starts every run, so throughput is bounded by that person; nothing it protects is not already bounded by the plan approval and grants.
- **A confirmation prompt (0137):** keeps a human act, but only where the host can ask, and a prompt-injected agent can still put a run in front of a person who confirms by habit.
- **Reading the person's request from the host transcript (0184):** no prompt needed, but it works only where a transcript exists and a forged line defeats it.
- **This decision:** no per-run act, no host dependence, and the approval is a durable, reviewable line in the plan.
- **Cost accepted:** the approval covers the text of each step, not its order or Needs, and an approved plan can be started on any range of it. A prompt-injected agent can therefore start a run on any approved plan (it cannot approve one or edit its steps without invalidating it), with `--hours` up to 72 and the grants of the `run-grants` answer (git-push, pr-create, pr-merge, pr-close; green checks, default branch and range preconditions still apply). A plan with neither an Approval line nor a store entry is not gated by `plan start` or `run next` (as before), and a drafted plan can still dodge that gate by deleting its line; only the agent start path requires the entry. Plans with no entry still need a person to start a run or to approve the plan.
