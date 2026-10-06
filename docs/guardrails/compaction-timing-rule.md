---
id: compaction-timing-rule
title: Context is compacted at task boundaries
status: active
date: 2026-10-05
tags: [practice-packs, harness, guardrail]
governed-by: 0037-compaction-timing
grounded-in: [0037-compaction-timing]
derivation-note: Given the timing decision, compacting at other moments loses detail or cache.
go-getter:
  enforcement:
    - tier: 1
      check: Compaction follows the timing decision; reviewed in PRs
  generated-by: context@0.3.0
  pack-answer: compaction
  pack-option: task-boundaries
---

## Guardrail

Compact context at task boundaries, not mid-task.
Advisory (tier 1 only).
