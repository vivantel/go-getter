---
id: watches-use-the-wrapper
title: Watches start through go-getter watch, --until done for CI runs and long commands
status: active
date: 2026-10-05
tags: [practice-packs, harness, guardrail]
governed-by: 0076-watcher-noise
grounded-in: [0076-watcher-noise]
derivation-note: Given the noise decision, a watch started outside the wrapper is not throttled.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction only; no host hook rewrites watch calls yet
  generated-by: context@0.2.0
  pack-answer: watcher-noise
  pack-option: quiet
---

## Guardrail

Start watches through `go-getter watch`; use `--until done` for CI runs and long commands.
Advisory (tier 1 only).
