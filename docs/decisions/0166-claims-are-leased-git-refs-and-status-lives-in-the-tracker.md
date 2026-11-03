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

1. **Claim.** A unit is claimed by creating the remote ref `refs/go-getter/claims/<unit-id>` with an atomic push that fails if the ref exists. The ref records the holder (kind `human|agent|ci`, and an id), the lease expiry, the brief version (0173) and the last heartbeat. Renewal is a compare-and-swap push against the previous value; an expired lease may be taken over the same way. After creating its ref the claimant re-reads the claim refs; if an earlier overlapping claim exists (the same unit, an ancestor or a descendant, or an overlapping scope, 0167; earlier means by recorded `created` time, then holder id) it deletes its own ref and is queued. Both claimants compute the same order from the same data, so exactly one keeps its claim. A claim covers its unit's subtree: a descendant is claimed only as a delegation by the ancestor's holder, and an ancestor cannot be claimed while someone else holds a descendant. The ref name is `refs/go-getter/claims/<file-stem>/<local-id>` (0165 item 4).
2. **Lease and renewal.** The lease depends on the holder's kind (pack answers; defaults: agent 60 minutes, ci the job's time limit, human 8 hours). It is renewed by `heartbeat`, by every `go-getter` verb and by the generated pre-commit and pre-push git hooks, so a worker that cannot run a timer (a host agent in a long tool call) is still renewed by its own commits and verbs. Renewal changes only the ref, never a file in the working tree and never the tracker. **A unit with live child units has no lease:** its claim ends when all its children are done, cancelled or superseded, or when its holder releases it; accountability for it is the `Owner-id`, not the holder's heartbeat. **A parked unit (0168) holds a non-expiring `parked` state** woken only by an answer or its wake date (0178), never by a lapse.
3. **Status.** The tracker issue of the unit carries state changes and progress as comments (writes follow the project's tracker answer, 0160). A project without a tracker computes status from the claim refs and merged state. Status of a parent is **computed on read** from its children, never stored (0174).
4. **No shared board.** The `Status board` and the in-commit `Progress` lines of the 2026-11-01 roadmap are retired: a step's marker changes in the unit's own PR, and nothing else records live state in git. The product index holds no step state.
5. **Holder identity.** A claim names who holds it; a claim whose holder does not match the author of the commits on the unit's branch is flagged (guardrail `a-claim-names-its-holder`). Signing claims is deferred.

## Why

A shared status file is touched by every PR, so at thousands of units it is a permanent merge conflict and a place where stale state hides. A ref is the one git object that gives an atomic create-if-absent on every git host with no service to run, which keeps 0015 and `no-runtime-dependencies`. Tracker assignment is not atomic and has no expiry; front-matter claims race at merge time.

## Tradeoffs considered

- **Tracker issue only:** simple and human-friendly, but not atomic, no lease expiry, and makes the tracker mandatory against 0117.
- **Claim in plan front matter:** needs no tracker, but two actors learn of a clash only at merge.
- **Cost accepted:** thousands of refs and heartbeats load the git remote, and tracker comments are rate-limited, so heartbeats stay in the ref and the tracker sees only state changes.
