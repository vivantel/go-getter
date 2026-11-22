---
id: draft-wp-release-returns-the-slot-and-never-deletes-the-branch
title: Releasing a pool slot returns the slot and leaves the branch; only reap deletes a branch it proved merged
status: active
accepted-by: sergemso
date: 2026-11-22
tags: [practice-packs, harness, coordination]
---

## Decision

1. `go-getter pool release` and a session end return the slot (detach at the base, drop the lease) and never delete a branch.
2. `go-getter pool reap` deletes the local branch only for a slot it has proved merged by content (decision on merged-ness in `draft-wp-closed-unmerged-pr-keeps-its-slot-and-done-work-releases-it`).
3. `go-getter pool acquire --branch B` resumes a local branch B that no slot holds; a branch a slot holds is still refused.

## Why

The branch belongs to the user and the forge, not to the pool; freeing a slot is the pool's job. Deleting the branch on release was the one effect a person could not undo locally, so careful agents kept slots claimed instead of releasing them (a session kept a worktree rather than risk its only copy of the commits). Release already refuses unsaved or unique work, so keeping the branch costs nothing and removes the reason to hesitate.

## Tradeoffs considered

- **Delete on release, as the first implementation did**: leaves no clutter, but is destructive without a recorded reason and surprises anyone who pushes, releases and comes back.
- **Never delete, `reap` included**: simplest, but leaves merged branches that only `reap` can prove merged (squash merges defeat `git branch --merged`).
- **Cost accepted**: pushed-but-unmerged branches stay in the local list until merged and reaped.
