---
id: 0215-parallel-isolation
title: Parallel tasks run in slots of a worktree pool
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  isolation: worktree-pool
  generated-by: orchestration@0.1.6
  pack-answer: isolation
  pack-option: worktree-pool
---

## Decision

Run every task in a slot of a per-repository worktree pool: `go-getter pool acquire` claims one, `go-getter pool release` frees it, `worktree new` and `worktree clean` use the pool, and finished work is released at once (pack orchestration@0.1.6).

## Why

Slots are reused and warm, merged and abandoned work is reaped without guessing, and no agent needs raw `git worktree` commands.
