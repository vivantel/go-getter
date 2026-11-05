---
id: 0204-an-enforcement-entry-may-say-whether-its-check-is-derived
title: An enforcement entry may say whether its check is derived from the guardrail or hand-written
status: draft
date: 2026-11-05
tags: [enforcement, guardrail, knowledge-base]
track: product
---

## Decision

Extends the `go-getter.enforcement` entry of decision 0066 item 3; the other fields and decision 0009 are unchanged.

1. **A new optional field `origin`** on each enforcement entry, with two values: `derived` (the check is produced from this guardrail's own text or parameters) and `authored` (the check is hand-written).
2. **A missing value means `authored`.** `collectEnforcement` reports `origin: authored` for an entry without the field.
3. **`check:guardrails` accepts the field and refuses any other value**, naming the guardrail file and the entry.
4. **No existing guardrail is changed.** This decision only adds the field. Which entries are labelled `derived`, and when, is decided later by the rule that uses the field.
5. **The field does not change enforcement.** It is not read when a check runs, a hook is generated or a gate decides; it is data for measurement.

## Why

`generated-by` says a pack emitted a guardrail file; it does not say whether the check logic comes from the guardrail's text. The paper-instruments plan (step P4, issue #317) needs that distinction to read how much enforcement is derived against hand-written, and nothing in the artifact records it. A default of `authored` keeps every existing file valid and truthful without a backfill, since none has been labelled.

## Tradeoffs considered

- **Required field**: forces a decision per entry, but changes 50-odd existing files in this step and invites guesses; rejected.
- **Infer from `generated-by`**: a pack-emitted file can still carry a hand-written check, so the inference would be wrong; rejected.
- **Cost accepted**: until entries are labelled, every entry reads as `authored`, so early readings undercount `derived`.
