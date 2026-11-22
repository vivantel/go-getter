---
id: 0216-pool-size
title: The pool holds 10 slots
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-size: "10"
  generated-by: orchestration@0.1.6
  pack-answer: pool-size
  pack-option: "10"
---

## Decision

The pool has at most 10 slots; `go-getter pool acquire` and `worktree new` refuse more. (pack orchestration@0.1.6).

## Why

Each slot is a full checkout and a cold build, so the size is a cost cap as much as a concurrency cap.
