---
id: 0193-claim-parent-idle
title: A parent unit with live children is flagged idle after 7 days without action
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  parent-idle: "7"
  generated-by: orchestration@0.1.3
  pack-answer: parent-idle
  pack-option: "7"
---

## Decision

A parent unit with live children is flagged idle after 7 days without action (decision 0166; pack orchestration@0.1.3).

## Why

A claim must expire so a lost worker frees its unit, and the margins keep clock differences from taking a live claim.
