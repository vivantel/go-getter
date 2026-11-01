---
id: 0158-merge-requires-a-gate-stack-and-a-sampled-human-audit
title: An agent merges only after a gate stack passes, and the owner audits a sample of merged PRs
status: active
date: 2026-11-01
tags: [verification, ci, agent-roles]
track: process
accepted-by: sergemso
---

## Decision

1. **Gate stack, all green, in order:** the step's `Check` command; `go-getter:conform` against decisions and guardrails; a read-only `reviewer` (0039) on a fresh context given only the diff, brief and decisions; CI.
2. **Sampled audit.** The owner reads about 20% of merged PRs, chosen by `go-getter audit pick` (random, plus every PR the reviewer flagged), in the digest (0155).
3. **A failed audit tightens the gates:** the finding becomes a check, a guardrail or a reviewer instruction before the next run starts.

## Why

Removing per-PR owner review (0155) must not lower quality (0154). Each layer catches a different defect (behavior, drift from commitments, blind spots of the author, integration); sampling bounds the owner's time while keeping a measured error rate. It builds on the layered gate of 0013 and the review bar of 0058.
