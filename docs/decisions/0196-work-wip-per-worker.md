---
id: 0196-work-wip-per-worker
title: A worker holds at most max-concurrent work units at once
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  wip-per-worker: max-concurrent
  generated-by: orchestration@0.1.4
  pack-answer: wip-per-worker
  pack-option: max-concurrent
---

## Decision

A worker holds at most max-concurrent work units at once (`max-concurrent` stands for the agents answer); `go-getter work next` offers it nothing above that (decision 0174 item 2). (pack orchestration@0.1.4).

## Why

A worker that holds many units finishes none quickly; the default follows the number of agents that may run at once (decision 0156).
