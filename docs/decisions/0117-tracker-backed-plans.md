---
id: 0117-tracker-backed-plans
title: An optional tracker pack makes issues the source of truth for plan steps, with writes through go-getter's own verbs only
status: active
date: 2026-10-11
tags: [roadmap, practice-packs, tooling]
track: product
accepted-by: sergemso
---

## Decision

A `tracker` pack lets a project keep plan steps in an issue tracker. It is optional: the first question asks whether plans live in files, in the tracker, or both, and defaults to files. A project that answers files sees no change.

- **Trackers:** GitHub Issues and Jira from the first version, one per project (the project's answer; the tracker need not be the git host). `plan` reads steps through the WorkSource interface of 0118: the file source, the GitHub source (through `gh`; reference forms `#123`, `owner/repo#123`, a URL) and the Jira source (REST through Node's `fetch`; `PROJ-123` and a browse URL). Each is a module in-process and may become a helper process under 0118 when a third tracker or a third party appears.
- **Jira access:** the site, project key, and the names of the environment variables holding the account email and API token are pack answers; go-getter reads the variables and never writes, prints or records their values, and the shared secret patterns gain an Atlassian token kind. A Jira status maps by its status category (to do, in progress, done), not its name. Closing picks the one transition into the done category; with none or several it refuses and lists them, unless the pack answer names one.
- **Source of truth:** for a step with an issue, the issue's state decides, and `plan status|next` show it. A step without one stays file-driven. When the file and the issue disagree, the disagreement is reported and neither is changed. Without `gh` or the network, the last state read is shown and labelled stale.
- **Refs:** `refs`, `attribute` and `conform` list a step's issue, or one the branch slug names, as a `Refs:` target, as they list an OpenSpec change folder (0075).
- **Writes:** `plan` verbs only (create an issue from a step, comment, close). The pack answer is `off`, `ask` or `allow`, defaulting to `ask`. The answer governs only these verbs; raw `gh issue *` and `gh api` stay gated by `gated-actions-need-human-approval` whatever the answer. Every verb has a dry run that prints what it would send, and records the verb and the outcome (never the issue text) in telemetry.
- **Hierarchy:** none in the first version (a source may later declare a `hierarchy` capability, 0118). Sub-issues and task lists are not synced. A later `plan import #N` may read an epic once and write a plan file; after that nothing stays linked.
- **Autonomous runs:** whether `allow` writes apply to an unattended run is decided with L.8, not here.

Supersedes the wording of backlog item L.7 ("no two-way sync, no state of its own"). It does not change 0075.

## Why

The owner wants plans and tasks to live where a team already tracks work, as an option, not a requirement. Issue state as truth avoids two statuses to reconcile by hand. Limiting writes to named verbs keeps the human-approval guardrail whole: an `allow` answer permits go-getter's own bounded actions, not arbitrary tracker commands. Leaving out hierarchy sync avoids a plan that cannot say what its steps are when the network fails.

## Tradeoffs considered

- **L.7 as written (links only):** no network, auth or state, but a plan and its issues drift apart by hand. Rejected by the owner.
- **File as truth, tracker as mirror:** keeps `plan` offline, but two statuses must agree. Rejected.
- **`allow` covering raw `gh`:** fastest, but it overrides the human-approval guardrail from a pack that does not own it. Rejected.
- **Live epic sync:** least manual, but it depends on remote hierarchy changes and has no field for `Needs`.
- **Costs accepted:** `plan` gains a network path and a stale state; a renumbered plan loses its old step ids; the first version covers one tracker.
