---
id: draft-wp-closed-unmerged-pr-keeps-its-slot-and-done-work-releases-it
title: A pull request closed without merging keeps its slot; work that is done is released at once and never freed on a guess
status: active
accepted-by: sergemso
date: 2026-11-21
tags: [practice-packs, harness, guardrail, coordination]
---

## Decision

Drafted from the owner's answers of 2026-11-21 in `docs/plans/worktree-pool.md`; accepted by the owner 2026-11-21.

1. **Closed-unmerged keeps the slot.** A slot whose pull request was closed without merging is listed as `closed-unmerged` in `status` and the daily digest until the owner releases it or its commits are patch-equivalent to the base (`git cherry`). `reap` never frees it.
2. **Merged-ness is decided by content.** A slot is merged only when its claim is older than the grace and one of these holds: upstream gone; ancestor of the base after moving off its base commit; patch-equivalent to the base; a merged pull request with the same head; a closed pull request whose commits are all patch-equivalent in the base; branch ref gone and its commits in the base.
3. **Dirty merged slots are archived, then freed.** `reap` writes the uncommitted files to `.go-getter/pool/backup/` and records what it backed up before freeing; no command frees a slot holding uncommitted work without a backup.
4. **Free means ignored or listed scratch only.** A slot is free when it is detached on the base, has no tracked change and every untracked file is ignored or matches the `scratch` answer. An untracked file that is neither makes the slot `unmanaged` with its path as the reason.
5. **Finished work is released, not hoped for.** The verbs that end work release the slot themselves, and the guardrail `release-the-slot-when-work-is-done` (draft until the pool is adopted here) states it; a session ending on a slot that is merged or fully pushed and clean is flagged.
6. **Release refuses unsaved or unique work** unless forced, and `--backup` archives before forcing.

## Why

Freeing a slot is the one irreversible act in a pool; every wrong guess loses work. Keeping a closed pull request costs a slot until a person looks; freeing it wrongly costs commits. Termenbox's two opposite failures (13 leftovers held forever, and a unique commit refused only by luck) both came from deciding by branch name or head hash instead of content.

## Tradeoffs considered

- **Free on close**: reclaims slots faster, but a closed pull request often means "redo", not "done".
- **Free after a timeout**: no human step, but it is a guess about work.
- **Cost accepted**: a closed-unmerged slot occupies capacity until released; `status` and the digest name it so it is not silent.
