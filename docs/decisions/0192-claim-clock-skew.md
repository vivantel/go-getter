---
id: 0192-claim-clock-skew
title: A lease lapses 5 minutes after its expiry, and a clock that far off the host cannot claim
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  clock-skew: "5"
  generated-by: orchestration@0.1.3
  pack-answer: clock-skew
  pack-option: "5"
---

## Decision

A lease lapses 5 minutes after its expiry, and a clock that far off the host cannot claim (decision 0166; pack orchestration@0.1.3).

## Why

A claim must expire so a lost worker frees its unit, and the margins keep clock differences from taking a live claim.
