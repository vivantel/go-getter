---
id: draft-release-request-survives-merges
title: A release request is bound to the version it asks for, not to the default branch head
status: draft
date: 2026-11-04
tags: [hooks, enforcement, security]
track: product
---

## Decision

Pending the owner's acceptance. Supersedes item 4's first two sentences of decision 0187 and the head test in its item 3 (and the "head" line of 0188 that repeats it); everything else in 0187 and 0188 stands, and a release stays a human act (0094, 0155).

1. **A request is checked against the version, not the head.** `go-getter release --batch` takes the user's newest claimed request and recomputes the release from the commits. It proceeds when the request still fits: a named bump is not below the computed bump, a named version is not below the computed version. Commits merged after the request do not void it.
2. **A release that grew is refused.** When the commits now need more than was asked (a patch request and a feature merged since), it refuses and names what would ship and what to say, as before (0159 item 4).
3. **One request, one release, one hour** are unchanged (0187 item 4, third sentence). A typed `approvals release` stays bound to a sha.
4. **The check at merge stays.** The CLI still refuses to merge when the default branch moved while the release pull request's checks ran, because the tested tree is then not what would land; the request is spent by then, so the user asks again.
5. **The record keeps the head** it was made at, for `approvals list` and the release pull request, but nothing compares it.

## Why

The owner asked for a minor release and had to ask again because the fix the release itself needed merged in between (2026-11-04: the first release since 0183 failed its generated-files check, and the fix moved the head). The product's measure is human minutes per merged outcome (0154); a second ask caused by the tool's own gap is the relay it exists to remove. The head test also guarded nothing the version test does not: growing a patch into a minor is refused by item 2, and every commit on the default branch passed the gate stack, and the release re-runs all three layers before anything is pushed.

## Tradeoffs considered

- **Keep the head binding (0187 item 4):** the user sees exactly what ships, at the cost of a second request after any merge, including ones the release needs.
- **Void only on merges that touch the release tooling:** needs a path list that drifts.
- **Cost accepted:** a commit that changes nothing in the version (a fix after a minor request) ships in the release without the user having seen it by sha; the user asked for "the next minor", and the dry run still lists the commits.
