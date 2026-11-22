---
id: 0220-pool-claim-grace
title: A claim is safe from reaping for 600 seconds
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-claim-grace: "600"
  generated-by: orchestration@0.1.6
  pack-answer: pool-claim-grace
  pack-option: "600"
---

## Decision

Reap never frees a claim younger than 600 seconds. (pack orchestration@0.1.6).

## Why

A slot claimed a moment ago has no commits yet, so it looks merged until the claim has had time to start.
