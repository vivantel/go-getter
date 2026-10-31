---
id: 0148-update-may-take-recommended-defaults-for-unrecorded-answers-after-a-dry-run
title: `update` may take recommended defaults for answers no artifact records, only after a dry run that lists each one, and renders them as draft
status: active
date: 2026-10-31
tags: [interview, configuration, generated-files, enforcement]
track: process
accepted-by: sergemso
---

## Decision

Extends 0085 and 0090; supersedes none.

1. **Default behaviour is unchanged.** `update` leaves a pack as it is when an active question that is not new (0085) has no recorded answer, and names the questions. It now also prints `go-getter interview next <pack> --current` (0147), which asks only those questions with every recorded answer kept.
2. **`update --accept-defaults` fills the gaps.** For a choice question it takes the recommended option; for a text or list question its `default` or detected value. A question with neither makes the pack stay as it is.
3. **The defaults are shown before they are applied.** `update --accept-defaults` prints the plan with, per pack and question, the value taken and the rule that value produces; with `--dry-run` it stops there. Without it, it writes only after the owner confirms that plan interactively. It refuses `--yes` and a non-interactive run, so a CI run cannot take defaults.
4. **The result is draft.** Decisions rendered this way are `draft` (0091) and carry `accepted-by` only when the owner accepts them. The answers file is not an authority: the artifacts remain the record.
5. **Nothing is guessed silently.** A guardrail whose enforcement a taken default would newly turn on is listed first in the dry run, marked as enforcing.

## Why

0090 refuses to guess because a guessed answer can change a project's rules. That holds for a silent guess; it does not for a listed, reviewable default on a draft. Without this, a project whose answers cannot all be recovered has only a full re-interview, which is what makes `update` feel like a reinstall.

## Tradeoffs considered

- **Always re-interview**: exact, and the current cost.
- **Take defaults silently**: fastest, but rejected by 0090's reasoning.
- **Defaults under `--yes`**: allows CI, but removes the review the rule depends on.
- **Cost accepted:** a draft guardrail may already be enforced by `apply` before acceptance, so the dry run must say so.
