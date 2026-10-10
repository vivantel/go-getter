---
id: 0111-checkpoint-retention
title: The 10 newest checkpoints are kept
status: active
date: 2026-10-10
tags: [practice-packs, hooks]
track: process
accepted-by: sergemso
go-getter:
  generated-by: checkpointing@0.2.0
  pack-answer: retention
  pack-option: "10"
---

## Decision

Checkpoints beyond the 10 newest are pruned when a new one is taken (pack checkpointing@0.2.0).

## Why

Size stays bounded with nothing to clean up by hand (decision 0097).
