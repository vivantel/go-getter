---
id: 0156-up-to-10-agents-run-at-once-each-in-its-own-worktree
title: Up to 10 agents run at once, each in its own worktree on its own branch
status: active
date: 2026-11-01
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  max-concurrent: "10"
---

## Decision

Run at most 10 agents concurrently, each in its own git worktree and branch ending in its own PR. This supersedes 0042 (3 agents). Scheduling follows the plan's `‖` markers and `Needs` graph; steps that touch the same files are not run together. The orchestration pack answer `max-concurrent` becomes 10, so the `max-concurrent-agents-rule` guardrail and `go-getter worktree new` follow it (plan `docs/plans/roadmap.md`, step T6, which also sets 0042 to `superseded`).

## Why

Parallel independent plan steps are the largest multiplier that does not need the owner. 0042 chose 3 for cold-cache and merge cost; the cost is now bounded by worktree isolation, per-step budgets (0063, 0144) and conflict-aware scheduling, not by a low cap.
