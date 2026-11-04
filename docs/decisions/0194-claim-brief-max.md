---
id: 0194-claim-brief-max
title: A delegated unit keeps at most 8 KB of brief fields in the claims ledger
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  brief-max: "8"
  generated-by: orchestration@0.1.3
  pack-answer: brief-max
  pack-option: "8"
---

## Decision

A delegated unit keeps at most 8 KB of brief fields in the claims ledger (decision 0166; pack orchestration@0.1.3).

## Why

A claim must expire so a lost worker frees its unit, and the margins keep clock differences from taking a live claim.
