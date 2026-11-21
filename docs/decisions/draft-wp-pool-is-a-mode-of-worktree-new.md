---
id: draft-wp-pool-is-a-mode-of-worktree-new
title: A worktree pool is a mode of `worktree new` and `worktree clean`, switched by the pack answer `isolation: worktree-pool`
status: draft
date: 2026-11-21
tags: [practice-packs, harness, coordination, hooks]
---

## Decision

Drafted from the owner's answers of 2026-11-21 in `docs/plans/worktree-pool.md`; the owner accepts it with the plan step WP0.

1. **A mode, not a second verb family.** With the orchestration answer `isolation: worktree-pool`, `go-getter worktree new` acquires a slot and `worktree clean` reaps. The per-task worktree of 0040 stays the default, so a project that does not answer changes nothing. This extends 0040, 0041 and 0156; it supersedes none of them. In pool mode the pool size is the concurrency limit of 0156.
2. **go-getter owns the hooks, the guardrail text and the verbs.** A project keeps no wrapper script; its only local files are its pack answers. Hooks reach each host through `apply` and the adapter registry, so neutral source names no host.
3. **Settings are answers, not constants.** Pool size, warm count, warm command, base branch, claim grace, session TTL, scratch patterns and branch pattern are pack answers with recommended defaults. The isolation gate (edits and non-read-only commands in a main checkout denied) is the opt-in answer `pool-only`.
4. **Node only.** The pool has no shell script and no runtime dependency. The `mkdir` lock of `worktree new` is kept and hardened with a pid-plus-start-stamp owner so a dead holder is taken over, not waited out.
5. **Done work is released.** `ship` and `pr` release the slot after a confirmed merge, `end-session` frees a finished slot, and `reap` frees a slot whose owner ended with the work pushed and clean. A slot is kept only for a reason `status` can name: open pull request, unpushed or dirty work, or `closed-unmerged`.
6. **Liveness reuses the work claim.** A lease records the worker identity and session; `live` or `lapsed` comes from the claim heartbeat of 0166, not a second mechanism.

## Why

go-getter already has `worktree new|list|clean` with a lock, a limit and squash-merge detection; a second verb family would duplicate it. The termenbox pool failed nine measured ways on 2026-11-21 (see the fact `draft-wp-termenbox-pool-failure-modes`) largely because its owner could not tell a live session from a dead one and kept slots on a guess.

## Tradeoffs considered

- **A separate `pool` verb only**: smaller change, but two places decide where work happens. Kept `pool` as the explicit surface and made `worktree new|clean` forward to it in pool mode.
- **Keep termenbox's shell script and wrap it**: no port cost, but a shell script cannot be generated per host or tested through the adapter registry, and the project would keep its own copy.
- **Pool on by default**: one fewer question, but it changes every existing project's behaviour.
- **Cost accepted**: two modes to test; every `worktree` assertion runs with the answer on and off (WP7).
