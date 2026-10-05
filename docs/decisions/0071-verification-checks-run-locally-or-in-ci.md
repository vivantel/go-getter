---
id: 0071-verification-checks-run-locally-or-in-ci
title: Each verification check runs locally, in CI or both, so thin dev machines run only the cheap ones
status: active
date: 2026-10-05
tags: [verification, ci, harness, practice-packs]
track: process
accepted-by: sergemso
---

## Decision

- The verification-gate pack (0031) distinguishes the checks `format`, `lint`, `typecheck`, `static-analysis`, `build`, `unit`, `integration` and `e2e`, each with a command (detected where possible) and a `where` of `local`, `ci` or `both`.
- A new question asks for the machine profile: `thin` (recommended default: format, lint, typecheck and affected unit tests local; the rest in CI), `full` (everything local) or `ci-only` (nothing local but the guardrail checks).
- The stop gate (0059) runs only `local` and `both` checks. `ci` checks are written by `apply` into the CI workflow as jobs; `go-getter ci status` reports the result for the current branch from the CI provider, and "done" for a pushed branch also needs it green or a human hand-over, bounded by the escalation limit (0062).
- GitHub Actions first; other providers are advisory until their detection and status lookup exist.

## Why

Agents on thin machines should not run builds, full suites or analyzers locally, yet the quality bar (0016) must still hold; splitting by cost keeps the loop fast and the bar intact.

## Tradeoffs considered

- **Always local (today)**: simplest, but slow or impossible on thin machines.
- **Everything in CI**: cheapest machines, but the agent loses the fast signal that makes the cheap tiers safe.
- **Cost accepted**: CI latency enters the loop and the agent reads CI output (tail only, never full logs); the check catalog extends the pack format (0022).
