---
id: draft-a7-five-advisory-guardrails-get-derived-checks
title: Five advisory-only guardrails get checks derived from their own text, and the rest stay advisory
status: draft
date: 2026-11-06
tags: [enforcement, guardrail, research]
track: product
---

## Decision

Implements the conversion set of the paper's intervention row C4 (decisions 0199 item 5 and 0200 item 4) and labels entries with the field of decision 0204.

1. **Five guardrails gain a deterministic entry labelled `origin: derived`**, each beside its existing tier-1 entry: `max-concurrent-agents-rule` (tier 3, `max-worktrees`), `reviewer-read-only` (tier 3, `reviewer-read-only`), `changes-land-as-one-squashed-pull-request` (tier 3, `squash-merged-head`), `restricted-data-hosts-rule` (tier 3, `hosts-block-pre-tool`), `tracker-writes-follow-the-answer` (tier 2, `deny-raw-tracker-writes`).
2. **`derived` is claimed only where the rule can be read from the guardrail's own words or its pack parameter** (the limit 10, "squash", "read-only", "blocking pre-tool hook", "never raw `gh issue`"). A guardrail whose rule needs judgment stays tier 1 and `authored`; the count of those is reported, not hidden.
3. **Each check covers the part of the rule a machine can see and the body says what it leaves advisory.** `squash-merged-head` does not know whether CI was green; `max-worktrees` counts worktrees, not agents.
4. **The pack sources are not changed in this step.** The five repo files are edited directly, so a later `go-getter update` of the packs will see them as modified (decision "owned files are never clobbered"). Moving the entries into the packs is a separate change.
5. **No merge before the cutoff in the paper plan (2026-11-09).** The change stays a draft pull request until then.

## Why

The paper's prediction AT3 asks whether a guardrail's enforcement can be generated from its text. Conversions that are claimed but cannot be read from the text would measure nothing, so item 2 limits the label to checks a reviewer can trace to the guardrail's words, and item 3 keeps the advisory remainder visible.

## Tradeoffs considered

- **Change the packs instead of the repo files**: reaches every adopter and fixes the drift risk, but changes behavior for all projects before this repo has run the checks; rejected for this step.
- **Convert more than five by naming existing checks (`check indexes`) as `derived`**: would raise the share but mislabel hand-written checks; rejected.
