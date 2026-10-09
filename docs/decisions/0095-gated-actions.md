---
id: 0095-gated-actions
title: Gated actions need a human
status: active
date: 2026-10-09
tags: [practice-packs, hooks, guardrail]
track: process
accepted-by: sergemso
go-getter:
  generated-by: hitl@0.1.0
  pack-answer: gated-classes
  pack-option: both
---

## Decision

Irreversible and outward-facing shell commands need a human: native ask rules on hosts that support them, a pre-tool hook hand-over on the others (pack hitl@0.1.0). Extra patterns: .

## Why

Decision 0043 asks agents to stop before costly actions; nothing enforces it without a gate (decision 0094).
