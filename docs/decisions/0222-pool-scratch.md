---
id: 0222-pool-scratch
title: Untracked files matching `none` do not make a slot unclean
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-scratch: none
  generated-by: orchestration@0.1.6
  pack-answer: pool-scratch
  pack-option: none
---

## Decision

A slot is free when every untracked file is git-ignored or matches `none` (`none` means only git-ignored files); any other untracked file is reported, never freed. (pack orchestration@0.1.6).

## Why

A build leaves output in a free slot; treating it as unsaved work leaves the pool full of slots that cannot be reused.
