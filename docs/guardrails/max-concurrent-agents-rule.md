---
id: max-concurrent-agents-rule
title: No more than 10 agents run at once per worker
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, guardrail]
governed-by: 0156-up-to-10-agents-run-at-once-each-in-its-own-worktree
grounded-in: [0156-up-to-10-agents-run-at-once-each-in-its-own-worktree]
derivation-note: Given the limit, each extra agent adds a cold cache and a merge.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; worktree creation is refused beyond the limit
  generated-by: orchestration@0.1.4
  pack-answer: max-concurrent
  pack-option: "10"
---

## Guardrail

Each worker runs at most 10 agents at once; the limit is per worker, not per project (decision 0169 item 2). `go-getter worktree new` refuses more than that many worktrees. Advisory (tier 1) otherwise.
