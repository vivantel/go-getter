---
id: 0027-context-pack-defaults
title: The context pack recommends a 150-line instruction cap, skills on demand, cost-model delegation, cache hygiene and compaction at task boundaries
status: active
date: 2026-10-05
tags: [practice-packs, harness, cost]
track: product
accepted-by: sergemso
---

## Decision

The `context` harness pack (component 4) asks five questions; recommended defaults:

1. Always-loaded instruction file cap: **150 lines** (alternatives 300, none). Tier 3 `file-max-lines`.
2. Detailed procedures: **skills loaded on demand** (alternatives always-on rules, one-line pointers).
3. Noisy work (search, logs, test output): **delegate to a subagent only when the cost model says the handoff is cheaper** (alternatives always delegate, inline).
4. Cache hygiene — no mid-task model, effort or instruction-file changes: **advisory everywhere plus a confirm-before-switch host hook where available** (alternatives advisory only, none).
5. Compaction: **at task boundaries** (alternatives host automatic, fresh session per task).

## Why

Every always-loaded token is paid on every request and every subagent; cached prefixes are cheap only if they stay stable (facts 0003, 0011).

## Tradeoffs considered

Each alternative above trades lower friction for higher steady token cost or lost cache hits; the recommendations favour required quality at minimal spend (0001).
