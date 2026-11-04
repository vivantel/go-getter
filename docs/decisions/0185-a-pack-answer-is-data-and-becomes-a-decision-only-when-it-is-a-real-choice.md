---
id: 0185-a-pack-answer-is-data-and-becomes-a-decision-only-when-it-is-a-real-choice
title: A pack answer is data and becomes a decision only when it is a real choice
status: draft
date: 2026-11-04
tags: [practice-packs, knowledge-base]
track: process
---

## Decision

Draft, for the owner's sign-off. It amends the "one decision per question" rule of `docs/skills/adding-a-practice-pack.md` and item 4 of 0150.

1. **An answer is recorded as data.** A pack answer lives in the project's answers record, with the pack version and the option; `update` and `render-pack` re-render from it. A question no longer needs a decision to be re-rendered.
2. **A question yields a decision only when the pack marks it `decision: true`.** A pack author sets it when the answer meets the usual ADR test: costly to reverse, a real choice with comparable alternatives, and a later agent could plausibly choose differently. The decision carries the alternatives in its Tradeoffs.
3. **Guardrails and procedures are unchanged.** An answer still emits the guardrail or skill text it emits today. Only the decision file is optional.
4. **Existing rendered decisions are migrated, not deleted.** Each `pack-answer` decision without listed alternatives moves into the answers record; the guardrail it produced keeps its `Refs:` by pointing at the pack and option. A migrated decision is archived with a one-line pointer in `INDEX.md`. Any decision other artifacts cite stays until those citations are updated.
5. **Authored decisions are reviewed one by one, with their Tradeoffs read in full.** The 2026-11-04 audit judged part of them without that section; its table is a guide, not a work list.

## Why

Of 165 decisions, 70 carry `pack-answer` and 77 list fewer than two alternatives. They record settings, not choices, and make the decision list and `INDEX.md` (29 KB) heavy for every agent that reads them. The decision doubles today as the stored answer, which is why the skill demands one per question; the answers record can hold that job.

## Tradeoffs considered

- **Keep one decision per answer:** every answer is traceable and `update` works unchanged, but the decision list stays mostly configuration.
- **Delete the pack-answer decisions without a record:** smallest list, but `update` could not re-render and 0067 forbids silent removal.
- **Mark every answer a decision by default and opt out:** fewer pack edits, but the noisy default returns for each new pack.
- **Cost accepted:** the renderer, `update`, `reconfigure` and the round-trip test change; golden files change in one step; old adoption versions need a read path for decision-held answers.
