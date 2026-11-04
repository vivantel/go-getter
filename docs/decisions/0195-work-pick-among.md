---
id: 0195-work-pick-among
title: Workers pick among the first 5 ready work units
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  pick-among: "5"
  generated-by: orchestration@0.1.4
  pack-answer: pick-among
  pack-option: "5"
---

## Decision

Ready work is ordered by priority, and a worker takes one of the first 5 by a hash of its id (decision 0174 item 1). (pack orchestration@0.1.4).

## Why

Workers asking at the same time spread over several units instead of all contending for the first claim on the ledger (decision 0166 item 1); a larger number spreads more and follows the order less closely.
