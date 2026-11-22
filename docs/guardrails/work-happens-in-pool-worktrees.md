---
id: work-happens-in-pool-worktrees
title: Work happens in a pool slot, not in the main checkout
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, guardrail]
governed-by: 0215-parallel-isolation
grounded-in: [0215-parallel-isolation]
derivation-note: Given a pool of slots, an edit in the main checkout is work the pool cannot see, protect or free.
go-getter:
  enforcement:
    - tier: 1
      check: "Instruction: acquire a slot (go-getter pool acquire) before editing"
    - tier: 2
      check: With the answer pool-only on, the pre-tool hook denies an edit or a changing command in the main checkout naming go-getter pool acquire, and a raw git worktree add, remove or prune naming the pool verb
      run: builtin:pool-isolation
  generated-by: orchestration@0.1.6
  pack-answer: isolation
  pack-option: worktree-pool
---

## Guardrail

Work in a slot from `go-getter pool acquire`. With `pool-only` on, hosts with a blocking pre-tool hook deny edits and changing commands in the main checkout and raw `git worktree add|remove|prune`; reads are always allowed. Hosts without one rely on the instruction and the git hooks, so the gate is advisory there.
