---
id: 0028-orchestration-pack-defaults
title: The orchestration pack recommends five roles, a read-only reviewer, worktree isolation without path claims, and a brief-result-evidence handoff
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: product
accepted-by: sergemso
---

## Decision

The `orchestration` harness pack (component 10, decision 0014) recommends:

1. Roster: **planner, explorer, implementer, reviewer, tester** (alternatives implementer + reviewer, none).
2. Reviewer: **read-only, findings only** (alternatives trivial fixes, full write).
3. Parallel isolation: **git worktree per task** (alternatives branches in one tree, none).
4. Worktree location: **`../<repo>-wt/<slug>`** (alternatives `.worktrees/` inside the repo, host default).
5. Maximum concurrent agents: **3** (numeric).
6. Path ownership claims: **none** — worktrees plus merge resolution. The owner chose this over the assistant's recommendation of enforced claims.
7. Hand over to a human when **blocked, before irreversible or outward-facing actions, and on a guardrail denial** (alternatives only when blocked, also before every commit).
8. Handoff contract: **brief → result → evidence** (alternatives free-form, structured JSON).

## Why

Separate roles are the routing lever (0014, 0016); a read-only reviewer keeps verification independent; worktrees prevent parallel agents from clobbering each other.

## Tradeoffs considered

- **Enforced path claims**: catch conflicts before they happen, but require up-front scoping of every task. Rejected; revisit if merge conflicts become frequent.
