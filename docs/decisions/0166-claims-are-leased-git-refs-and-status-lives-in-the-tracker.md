---
id: 0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker
title: A claim is an atomic git ref with an expiring lease that names its holder; status lives in the tracker issue, not in a shared file
status: active
date: 2026-11-03
tags: [coordination, roadmap, architecture]
track: process
accepted-by: sergemso
---

## Decision

1. **Claim.** A unit is claimed by creating the remote ref `refs/go-getter/claims/<unit-id>` with an atomic push that fails if the ref exists. The ref records the holder (kind `human|agent|ci`, and an id), the lease expiry, the brief version (0173) and the last heartbeat. Renewal is a compare-and-swap push against the previous value; an expired lease may be taken over the same way. Two claimants can never both succeed.
2. **Lease and heartbeat.** The lease is short (default 30 minutes) and renewed by heartbeat from the worker. Heartbeats change only the ref, never a file in the working tree and never the tracker. A parked unit (0168) holds its claim with a longer, bounded lease.
3. **Status.** The tracker issue of the unit carries state changes and progress as comments (writes follow the project's tracker answer, 0160). A project without a tracker computes status from the claim refs and merged state. Status of a parent is **computed on read** from its children, never stored (0174).
4. **No shared board.** The `Status board` and the in-commit `Progress` lines of the 2026-11-01 roadmap are retired: a step's marker changes in the unit's own PR, and nothing else records live state in git. The product index holds no step state.
5. **Holder identity.** A claim names who holds it; a claim whose holder does not match the author of the commits on the unit's branch is flagged (guardrail `a-claim-names-its-holder`). Signing claims is deferred.

## Why

A shared status file is touched by every PR, so at thousands of units it is a permanent merge conflict and a place where stale state hides. A ref is the one git object that gives an atomic create-if-absent on every git host with no service to run, which keeps 0015 and `no-runtime-dependencies`. Tracker assignment is not atomic and has no expiry; front-matter claims race at merge time.

## Tradeoffs considered

- **Tracker issue only:** simple and human-friendly, but not atomic, no lease expiry, and makes the tracker mandatory against 0117.
- **Claim in plan front matter:** needs no tracker, but two actors learn of a clash only at merge.
- **Cost accepted:** thousands of refs and heartbeats load the git remote, and tracker comments are rate-limited, so heartbeats stay in the ref and the tracker sees only state changes.
