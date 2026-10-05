---
id: 0033-instruction-file-cap
title: The always-loaded instruction file is capped at 150 lines
status: active
date: 2026-10-05
tags: [practice-packs, harness, cost]
track: process
accepted-by: sergemso
go-getter:
  generated-by: context@0.1.0
  pack-answer: instruction-cap
  pack-option: cap-150
---

## Decision

Keep `AGENTS.md`, the always-loaded instruction file, at or under 150 lines (pack context@0.1.0). Host instruction files that are symlinks to it share the cap.

## Why

Every always-loaded token is paid on every request and every subagent; cached prefixes stay cheap only if stable (facts 0003, 0011).
