---
id: 0221-pool-session-ttl
title: A session claim lapses after 43200 seconds
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-session-ttl: "43200"
  generated-by: orchestration@0.1.6
  pack-answer: pool-session-ttl
  pack-option: "43200"
---

## Decision

A branch still at its creation commit, or a claim whose owner has not beaten for 43200 seconds, may be reaped. (pack orchestration@0.1.6).

## Why

Work is never freed on a guess: only unsaved-work-free slots lapse.
