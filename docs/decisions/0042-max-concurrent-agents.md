---
id: 0042-max-concurrent-agents
title: At most 3 agents run at once
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  max-concurrent: "3"
  generated-by: orchestration@0.1.0
  pack-answer: max-concurrent
  pack-option: "3"
---

## Decision

Run at most 3 agents concurrently; `go-getter worktree new` refuses to exceed it (pack orchestration@0.1.0).

## Why

Each concurrent agent adds a cold cache and a merge to resolve.
