---
id: 0040-parallel-isolation
title: Each parallel task runs in its own git worktree
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  isolation: worktree
  generated-by: orchestration@0.1.0
  pack-answer: isolation
  pack-option: worktree-per-task
---

## Decision

Run every parallel task in its own git worktree, created with `go-getter worktree new <slug>` (pack orchestration@0.1.0).

## Why

Parallel agents on one working tree overwrite each other's edits.
