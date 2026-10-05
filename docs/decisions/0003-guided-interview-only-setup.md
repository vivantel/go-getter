---
id: 0003-guided-interview-only-setup
title: Project setup is a guided interview with recommended defaults, not auto-applied presets
status: active
date: 2026-10-04
tags: [interview, positioning, configuration]
track: product
accepted-by: sergemso
---

## Decision

The only way to configure a project is a guided interview: one question at a time, each with its options' tradeoffs and a recommended default, so accepting the defaults is the fast path. Facts discoverable from the repo (languages, CI, existing agent files, git history) are detected to prefill or skip questions. There are no preset profiles (solo / team / regulated) and no browse-and-install catalog as a configuration path.

## Why

The user prefers tailored, deliberate configuration over opaque presets: every practice is a visible, rationale-bearing choice, which also feeds the knowledge-base artifacts (0007).

## Tradeoffs considered

- **Auto-detect + presets + overrides** (assistant's recommendation): lowest friction on the default path. Rejected by the user.
- **Pick-your-packs catalog**: modular, but the user must know what to pick. Rejected.
- **Cost accepted**: more interaction per run and run-to-run variance. Mitigated by recommended defaults, detection-based prefill, and a deterministic pack format (0008).
