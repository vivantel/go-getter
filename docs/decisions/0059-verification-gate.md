---
id: 0059-verification-gate
title: "\"Done\" is blocked while the verification checks fail"
status: active
date: 2026-10-05
tags: [practice-packs, verification, harness]
track: process
accepted-by: sergemso
go-getter:
  verify-gate: block
  generated-by: verification-gate@0.1.0
  pack-answer: gate
  pack-option: block
---

## Decision

A stop hook runs the implement checks when the working tree has changes and keeps the agent working while they fail, at most the maximum number of escalations per session (decision 0032, default 2), then hands over to a human. Hosts without a blocking stop hook are advisory (pack verification-gate@0.1.0).

## Why

Without a blocking gate, cheaper tiers would ship failures instead of escalating (decision 0031).
