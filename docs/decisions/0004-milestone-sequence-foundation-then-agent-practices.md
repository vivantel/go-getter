---
id: 0004-milestone-sequence-foundation-then-agent-practices
title: v0.1 is foundation plus the agent core incl. routing and governance; git workflow and testing follow
status: active
date: 2026-10-04
tags: [milestones, roadmap, harness]
track: product
accepted-by: sergemso
expires: v0.1.0 is released
---

## Decision

- **v0.1**: foundation (repo, compiler for six host agents, vendored kms, interview engine, pack schema) plus the agent core harness packs: orchestration (agent roles 0014, parallelization incl. git worktrees), context management, cost & model routing (0016, static default policy), governance/DLP (0018), and the minimal verification gate and metadata telemetry that routing needs.
- **v0.2**: routing calibration loop (0017), full observability, human-in-the-loop gates, state & checkpointing.
- **v0.3**: SDLC git workflow — branching strategy, commit and PR rules; replaces this repo's interim workflow.
- **v0.4**: testing, coverage, debugging; memory beyond kms.
- **Later**: execution sandbox, release, review, docs, and remaining SDLC packs.

## Why

The agent core is go-getter's differentiator. Routing depends on governance (eligible models), verification (quality gate) and telemetry (outcomes), so they ship together and are consistent from day one.

## Tradeoffs considered

- **Governance in v0.1, routing in v0.2**: smaller v0.1, but the headline cost/quality feature waits.
- **Governance + routing only in v0.1**: sharpest focus, but no orchestration practices for longer.
- **Interim workflow**: until v0.3 this repo runs on a hand-written trunk-based workflow — short-lived branches, PRs, squash merge into protected `main`, Conventional Commits, kms `Refs:` trailers, a git worktree per parallel task; the bootstrap commit goes straight to `main`. The ratchet (0010) replaces it with the generated one.
- **Expiry**: the order after v0.1 is provisional and must be re-evaluated when v0.1.0 ships.
