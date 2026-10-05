---
id: 0043-human-escalation
title: Agents hand over to a human when blocked, before irreversible or outward-facing actions, and on a guardrail denial
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  escalation: Stop and hand over to a human when blocked, before any irreversible or outward-facing action, and when a guardrail denies an action.
  generated-by: orchestration@0.1.0
  pack-answer: escalation
  pack-option: blocked-irreversible-denial
---

## Decision

Hand over to a human when blocked, before any irreversible or outward-facing action, and on a guardrail denial (pack orchestration@0.1.0).

## Why

Agents must stop where a wrong guess is costly or the way forward needs a person (decision 0009).
