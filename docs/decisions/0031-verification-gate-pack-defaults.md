---
id: 0031-verification-gate-pack-defaults
title: The verification-gate pack recommends detected test, lint and typecheck checks, a reviewer verdict, and blocking completion
status: active
date: 2026-10-05
tags: [practice-packs, verification, harness]
track: product
accepted-by: sergemso
---

## Decision

The `verification-gate` harness pack (component 6) recommends:

1. Implement and debug steps pass **the detected test, lint and typecheck commands** (confirmed and editable as text answers; alternatives tests only, affected tests only).
2. Review steps pass **a reviewer-agent verdict** (alternatives verdict + conform check, none).
3. Gate strength: **block "done" until checks pass** via stop hooks, bounded by the escalation limit (0032); advisory on hosts without a blocking stop hook (Copilot, Kilo/OpenCode).

## Why

The quality bar of routing (0016, 0017) is these checks; without a blocking gate, cheaper tiers would ship failures instead of escalating.

## Tradeoffs considered

- **Report only**: no loops on flaky checks, but failures reach PR review.
- **Affected tests only**: fastest, needs test-impact mapping go-getter lacks.
