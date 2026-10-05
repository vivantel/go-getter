---
id: 0041-worktree-location
title: Task worktrees live next to the repository
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  worktree-location: sibling
  generated-by: orchestration@0.1.0
  pack-answer: worktree-location
  pack-option: sibling-dir
---

## Decision

Create task worktrees in `../<repo>-wt/<slug>` (pack orchestration@0.1.0).

## Why

A fixed location keeps worktrees discoverable and out of the main tree's way.
