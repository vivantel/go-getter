---
id: 0011-nodejs-zero-dependency-tooling
title: Compiler and enforcement scripts are Node.js ESM with zero runtime dependencies
status: superseded
superseded-by: 0019-node-prerequisite-oldest-supported-lts
date: 2026-10-04
tags: [nodejs, tooling, compiler]
track: process
accepted-by: sergemso
fitness-functions:
  - package.json declares no runtime dependencies
---

## Decision

The compiler, `init` helper scripts, the routing cost model, telemetry recording and tier-3 checks are written in Node.js (ESM) with no runtime dependencies; tests use `node:test`. Dev-only dependencies (e.g. promptfoo for behavior evals) are allowed but must never be required to run go-getter in an adopting project.

## Why

Node runs on Windows, macOS and Linux, parses JSON/frontmatter comfortably, and needs no per-OS binary distribution. Zero runtime dependencies keeps installs a clone-and-run.

## Tradeoffs considered

- **Go single static binary**: no runtime needed, but per-OS/arch build and distribution breaks the clone-and-run plugin model, and contributors need a Go toolchain.
- **POSIX shell + jq**: smallest, but brittle for six output formats and not native on Windows.
- **Cost accepted**: Node must exist wherever the compiler, host hooks or tier-3 scripts run. CI runners provide it; whether each host agent's environment does is unverified and must be established as a fact (plan phase 1) — the decision is revisited if it fails for a host.
- **Naming**: go-getter is not about Go the language (0001).
