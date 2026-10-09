---
id: 0090-update-and-remove-work-from-the-manifest
title: go-getter update re-renders from recorded answers, apply --remove undoes generated output outside docs, and drift is surfaced at session start and by apply --check
status: active
date: 2026-10-06
tags: [generated-files, configuration, dogfooding]
track: process
accepted-by: sergemso
governed-facts: [0033-apply-keeps-no-record-of-what-it-wrote]
---

## Decision

Draft from the owner's interview on updating and removing go-getter (2026-10-06); active since apply and update use the manifest (0091). Builds on 0089.

- **`go-getter update`**: reads the manifest, re-renders each adopted pack's artifacts in `docs/` from the recorded answers (a question added since takes its default, per 0085), then diffs the host outputs. It prints one dry-run plan (docs re-rendered, files added, changed or removed, `modified` items skipped) and applies only on confirmation.
- **`go-getter apply --remove`**: removes the files and blocks the manifest lists, restores the previous value of every key and of `core.hooksPath`, and deletes the manifest last. It leaves `docs/` (adopted decisions and guardrails stay as plain knowledge, their enforcement metadata inert) and `.go-getter/state` (the telemetry log).
- **Drift**: the session-start nudge adds one line when the manifest version or an adopted pack is older than the installed package, and `apply --check` fails on that mismatch.
- **Changes not derivable from answers**: recomputed, with a `renamed` map in a pack (old option id to new) and the manifest `schema`; no per-version migration scripts before 1.0.
- **No manifest yet** (this repo and any other adopter): the first `update` recomputes the outputs, records those that match as owned and the rest as `modified`.

## Why

Adopters must be able to take a new go-getter release, and leave, without hand cleanup or a lost edit. One command gives one reviewable diff, so pack changes reach adopters (a pack change counts only once adopted, guardrail `practice-ships-only-after-self-adoption`).

## Tradeoffs considered

- **`apply` does everything**: no new command, but `apply` runs from hooks and CI, and rewriting committed knowledge-base files blurs its role.
- **Two commands, documented order**: least code, but nothing warns when a pack is out of date.
- **Detach or delete `docs/` artifacts on removal**: cleaner leftovers, but many committed files change and the knowledge belongs to the team; a flag for it is deferred.
- **Migration scripts or re-running init on breaking releases**: handle any change, but are a framework to keep, or defeat `update` when the change is largest.
- **Check only, or nudge only**: the first never reaches the agent's context, the second never forces a project to catch up.
