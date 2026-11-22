---
id: release-the-slot-when-work-is-done
title: A slot is released as soon as its work is done
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, guardrail]
governed-by: 0215-parallel-isolation
grounded-in: [0215-parallel-isolation]
derivation-note: Given a bounded pool, a finished slot that stays claimed takes a place from the next task.
go-getter:
  enforcement:
    - tier: 1
      check: "Instruction: release the slot after the merge; ship and pr do it, the session-end hook frees a finished slot and reap frees merged ones"
  generated-by: orchestration@0.1.6
  pack-answer: isolation
  pack-option: worktree-pool
---

## Guardrail

Release a slot when its work is merged or has nothing unpushed (`go-getter pool release`; `ship` and `pr` release after a confirmed merge, `end-session` frees a finished slot). Keep a slot only for a reason `go-getter pool status` names: an open pull request, unpushed or dirty work, or a pull request closed without merging. Advisory (tier 1).
