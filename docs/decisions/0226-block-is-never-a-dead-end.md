---
id: 0226-block-is-never-a-dead-end
title: A block or a prompt names a fix an agent can run; auto-resolve runs only reversible fixes and never weakens a deny
status: active
accepted-by: sergemso
date: 2026-11-23
tags: [harness, coordination, guardrail]
---

## Decision

1. **A refusal names a fix.** Every block or prompt names a fix an agent can run without a human, and that fix is a verb the running build has.
2. **A constant safe fix is run by the tool.** If the fix is always the same safe step, the tool runs it instead of describing it.
3. **A human is asked only for a decision.** The prompt carries the evidence needed to decide; it never asks a person to relay a command.
4. **Every block and prompt is logged with its outcome** (fixed by verb, allowed on retry, human approved, human refused, abandoned) and reported as a rate. The measure is unnecessary interventions per 100 tool calls, read by akasha's `strata` query `interventions-per-100-calls`.
5. **Auto-resolve never weakens a deny and runs only a fix classed reversible.** Until effect classes ship (akasha plan step F1), the safe fixes are exactly: `go-getter pool acquire --branch <name>` into a free slot, `go-getter pool release` of a slot with nothing unsaved, and a read-only status verb. Any other fix is advice, not auto-run.

## Why

The owner's assessment (2026-11-22) is that gates prevent and interfere: a person spends time clearing refusals instead of being served by them. Counts from the session logs (akasha `docs/plans/evidence/`) show where the minutes go. A refusal with no runnable fix, or one pointing at a verb the installed build lacks (fixed in A3), is a dead end by construction.

## Tradeoffs considered

- **Advice only, never auto-run**: safest, but leaves the human relaying commands the tool could run.
- **Auto-run any named fix**: fastest, but could turn a refusal into an irreversible effect; item 5 rules it out until F1 classes every fix.
- **Cost accepted**: the short safe-fix list in item 5 is hand-kept until F1 replaces it with effect classes.
