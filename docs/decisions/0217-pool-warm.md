---
id: 0217-pool-warm
title: The pool keeps 2 free slots warm
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-warm: "2"
  generated-by: orchestration@0.1.6
  pack-answer: pool-warm
  pack-option: "2"
---

## Decision

`go-getter pool warm` keeps 2 free slots on the base and runs the warm command after a create or refresh. (pack orchestration@0.1.6).

## Why

A warm slot saves the first build of a task.
