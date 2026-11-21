---
id: draft-wp-pool-state-lives-in-the-main-checkouts-go-getter-dir
title: Pool state lives per repository in `<main checkout>/.go-getter/pool/`, git-ignored and shared by every slot
status: draft
date: 2026-11-21
tags: [practice-packs, harness, coordination]
---

## Decision

Drafted from the owner's answers of 2026-11-21 in `docs/plans/worktree-pool.md`; the owner accepts it with the plan step WP0.

1. **Location.** Leases, the lock, logs and backups live under `<main checkout>/.go-getter/pool/` (`backup/` for archives). The main checkout is the first entry of `git worktree list`, whatever slot a command runs in, so every slot reads and writes one copy.
2. **Not tracked.** `apply` adds `.go-getter/pool/` to the ignore rules it writes, and a test fails if the directory appears in `git status`.
3. **No user-level state.** Nothing goes to a user data directory; two clones of one repository have two pools.
4. **Lease record.** A small JSON record with a `version`, written `pending` then `held` by rename, so a crash leaves nothing or a record `doctor` can finish: `{version, branch, claimedAt, base, session, worker, state}`.

## Why

Termenbox kept leases in the git directory, which hides them from `git status` but ties them to one clone and makes them hard to inspect and back up. A per-repository directory beside the slots is visible to the owner, found from any slot, and removed with the clone.

## Tradeoffs considered

- **In the git directory** (termenbox): ignored for free, but a worktree's git directory is not the main one, so each command must resolve the common directory and backups sit in an unexpected place.
- **A go-getter data directory under the user's home**: one place for all repositories, but it breaks the "state travels with the clone" property, needs a repository key and leaks across checkouts.
- **Cost accepted**: one more ignore rule, and a stale `.go-getter/pool/` survives a deleted slot until `doctor` runs.
