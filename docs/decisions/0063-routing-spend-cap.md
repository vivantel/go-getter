---
id: 0063-routing-spend-cap
title: Headless runs are capped at 5 USD where the host has a cap
status: active
date: 2026-10-05
tags: [practice-packs, model-routing, cost]
track: process
accepted-by: sergemso
go-getter:
  headless-spend-cap-usd: "5"
  generated-by: cost-routing@0.1.0
  pack-answer: spend-cap
  pack-option: "5"
---

## Decision

Headless runs pass the host's native spend-cap flag with 5 USD; `go-getter route --headless-flags --host <id>` prints it (pack cost-routing@0.1.0). Hosts without a headless cap are not capped.

## Why

An unattended run has no human to notice runaway spend.
