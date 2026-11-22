---
id: 0224-pool-only
title: The main checkout is on for edits under the pool
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-only: on
  generated-by: orchestration@0.1.6
  pack-answer: pool-only
  pack-option: on
---

## Decision

With `on`, an edit or a changing command in the main checkout is denied by the pre-tool hook and names `go-getter pool acquire`; with `off` the pool is advice only. (pack orchestration@0.1.6).

## Why

The gate is opt-in because a project must have slots ready before it can refuse work in its main checkout.
