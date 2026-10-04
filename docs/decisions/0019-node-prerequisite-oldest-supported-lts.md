---
id: 0019-node-prerequisite-oldest-supported-lts
title: go-getter tooling is zero-dependency Node.js, requiring the oldest supported LTS, degrading gracefully where Node is absent
status: active
date: 2026-10-04
tags: [nodejs, tooling, compiler, enforcement]
track: process
accepted-by: sergemso
governed-facts: [0010-nodejs-release-schedule, 0009-host-capability-matrix]
fitness-functions:
  - package.json declares no runtime dependencies
  - engines.node equals the oldest Node.js LTS line still supported per the official schedule
expires: 2027-04-30 (end of life of the current floor, Node 22)
---

## Decision

Supersedes 0011, keeping its core and adding what the host research showed.

- The compiler, `init` helper scripts, routing cost model, telemetry recording, host hooks and tier-3 checks are written in Node.js (ESM) with **no runtime dependencies**; tests use `node:test`. Dev-only dependencies (e.g. promptfoo) are allowed but never needed in an adopting project.
- **Node is a declared prerequisite** on machines where go-getter enforces rules. The floor is the **oldest Node.js LTS line still supported** by the Node.js project — Node 22 as of 2026-10-04 (fact 0010) — set in `package.json` `engines.node` and checked by `init`. The floor moves when that line reaches end of life.
- **Graceful degradation**: where Node is missing, generated host and git hooks are thin `sh` / PowerShell shims that print a visible "go-getter enforcement unavailable: Node ≥ <floor> not found" warning and let the action proceed (fail-open). The coverage report marks tiers 2 and 3 advisory on that machine. CI, which always has Node, still enforces tier 3.

## Why

Fact 0009 shows Node is not guaranteed at runtime on Claude Code, Codex or Cursor installs (native binaries). One Node codebase stays simple and testable; failing open with a loud warning avoids blocking users without Node, and CI keeps the portable floor. The user set the floor rule as "earliest supported LTS, must be current"; Node 20 reached end of life on 2026-04-30, so the floor is 22.

## Tradeoffs considered

- **Standalone binaries for hooks** (Node SEA per OS/arch): enforcement everywhere, but per-OS release builds and no clone-and-run install.
- **Hooks in POSIX sh + PowerShell, Node only for compiler/CI**: no Node on dev machines, but check logic duplicated in three languages.
- **Cost accepted**: on machines without Node, tiers 2 and 3 are advisory locally; CI remains the backstop.
- **Expiry**: re-evaluate the floor by 2027-04-30, when Node 22 reaches end of life.
