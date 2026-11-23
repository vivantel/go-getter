---
id: draft-a5-free-pushed-slot
title: A slot whose branch is pushed with an open pull request is freed after 24 hours
status: proposed
date: 2026-11-23
tags: [harness]
track: process
---

## Decision

When a slot's owner has been gone for `pool-pushed-free-delay` seconds (default 86400) and the slot holds nothing unsaved, `pool reap` frees the slot even though its pull request is still open. The branch is kept, and `pool acquire --branch <name>` resumes it. A pull request closed without merging still keeps its slot, and so does any slot with unpushed or uncommitted work.

## Why

The commits are on the remote, so the slot protects nothing, yet it counted against the pool until the pull request merged. The owner chose a delay over freeing at once (2026-11-22, akasha plan step A5). The setting is read from an active orchestration decision's `pool-pushed-free-delay` key or forced in tests; a pack question for it is not added yet.
