---
id: using-the-worktree-pool
title: Work in a worktree pool slot from claim to release
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, procedural]
operationalizes: [work-happens-in-pool-worktrees, release-the-slot-when-work-is-done]
go-getter:
  generated-by: orchestration@0.1.6
  pack-answer: isolation
  pack-option: worktree-pool
---

## Procedure

1. Claim a slot before editing: `go-getter pool acquire --branch <type>/<slug>` (or `worktree new <slug> --branch <type>/<slug>`, which does the same in a pool project). It prints the slot path; work only there. A session that starts with `pool-only` on is given an unnamed slot; name it with `go-getter pool name <branch>`.
2. Work and commit in the slot. Use commits, never `git stash`: stashes are shared by every slot and nothing drops them.
3. Never run raw `git worktree add|remove|prune|move`. Use `pool remove <path>` for a worktree outside the pool, `pool adopt <path>` to bring one in and `pool doctor` for dead or orphaned directories.
4. Push and merge as in working-a-change. `go-getter ship` and `go-getter pr` release the slot after a confirmed merge.
5. Release the slot as soon as the work is done: `go-getter pool release`. It refuses unsaved or unique work; `--backup` archives it under `.go-getter/pool/backup/` before `--force`.
6. A slot is kept only for a reason `go-getter pool status` names: an open pull request, unpushed or dirty work, or a pull request closed without merging (`closed-unmerged`, kept until a person releases it).
7. When blocked (a full pool, an `unmanaged` slot, a refused release) run `go-getter pool status`, then `pool reap` and `pool doctor --dry-run`, and hand over to a person with what they print. Never delete a slot directory by hand.
