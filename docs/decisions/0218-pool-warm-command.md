---
id: 0218-pool-warm-command
title: The pool warms a slot with `none`
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-warm-command: none
  generated-by: orchestration@0.1.6
  pack-answer: pool-warm-command
  pack-option: none
---

## Decision

After a slot is created or refreshed the pool runs `none` in it (`none` means nothing runs). (pack orchestration@0.1.6).

## Why

The warm command is project specific (an install or a first build), so it is an answer and not a constant.
