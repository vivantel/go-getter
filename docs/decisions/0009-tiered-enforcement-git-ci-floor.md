---
id: 0009-tiered-enforcement-git-ci-floor
title: Rules are enforced in tiers, with host-independent git hooks and CI as the floor
status: active
date: 2026-10-04
tags: [enforcement, git-hooks, ci, hooks]
track: process
accepted-by: sergemso
---

## Decision

Every guardrail declares the tiers that enforce it (`go-getter.enforcement`, 0007):

1. **Instruction** in the agent file or rules — advisory.
2. **Host hook / permission** where the host agent supports it — early, rich feedback, can block an action before it happens.
3. **Git hook + generated CI check** — identical on all six host agents and for human contributors.

Tier 3 is the portable floor. The compiler selects the strongest tier each host supports from its capabilities manifest. A guardrail with only tier 1 must state that it is advisory. A harness component a host cannot enforce at all (e.g. a blocking DLP rule) is reported as advisory on that host.

## Why

Host extension points are uneven across the six (0002); unenforced rules drift and get skipped under context pressure, which contradicts "most robust".

## Tradeoffs considered

- **Instructions only**: portable, trivial, unreliable.
- **Claude Code hooks first, others best-effort**: strong where used, no guarantee elsewhere and no CI backstop.
- **Cost accepted**: a tier-3 check library and CI generation are core work; tier-3 feedback arrives after the action, not before it.
