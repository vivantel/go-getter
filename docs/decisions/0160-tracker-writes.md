---
id: 0160-tracker-writes
title: go-getter may write to the tracker without asking
status: active
date: 2026-11-01
tags: [practice-packs, roadmap]
track: process
accepted-by: sergemso
go-getter:
  tracker-writes: allow
  generated-by: tracker@0.3.0
  pack-answer: writes
  pack-option: allow
---

## Decision

`go-getter plan issue create`, `comment` and `close` run without a human approving each one (pack tracker@0.3.0); the text they send is checked for secrets and personal data first, and raw `gh issue` commands stay gated by the hitl pack.

## Why

The project accepted the visibility of agent-written issues for less friction.
