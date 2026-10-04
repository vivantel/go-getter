---
id: 0013-layered-verification-gate
title: go-getter is verified in three layers - unit, golden output, behavior evals
status: active
date: 2026-10-04
tags: [verification, eval, ci]
track: process
accepted-by: sergemso
---

## Decision

1. **Unit tests** (`node:test`) for the compiler, routing cost model, telemetry and scripts.
2. **Golden-output snapshots** of every host agent's generated files, plus the self-hosting drift check (0010).
3. **Behavior evals** (promptfoo) of the `init` interview on fixture repos — run on Claude Code in CI, other host agents on demand.

Layers 1 and 2 are deterministic and gate every PR; layer 3 gates releases. This is go-getter's own release gate; the verification-gate harness pack it ships to projects is a separate thing (0016, 0017).

## Why

Configuration that behaves differently across six host agents breaks silently; deterministic layers catch compiler regressions cheaply, and evals catch agent-behavior regressions.

## Tradeoffs considered

- **Deterministic only**: fast and cheap, but nothing checks that agents follow the interview.
- **Evals only**: tests the user experience, but slow, costly, non-deterministic and weak on compiler regressions.
- **Cost accepted**: CI time and tokens for layer 3.
