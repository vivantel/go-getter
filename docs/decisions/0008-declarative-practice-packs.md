---
id: 0008-declarative-practice-packs
title: Practice areas are declarative packs in two families - harness packs and SDLC packs - driven by one init skill
status: active
date: 2026-10-04
tags: [practice-packs, interview, architecture, harness]
track: process
accepted-by: sergemso
fitness-functions:
  - Every pack validates against the pack schema in CI
  - A coverage report maps every harness component to the packs covering it
---

## Decision

A practice area is a pack: a data file declaring its questions, each option's tradeoffs and recommended default, repo-detection probes, and the outputs each answer produces — knowledge-base artifact templates, enforcement entries per tier (0009), and compiled host outputs. One generic `init` skill interprets any pack. Packs are validated against a schema and loaded one at a time.

Packs come in two families sharing one schema:

- **Harness packs** map to the 12 harness components (fact 0002) — e.g. orchestration, context, verification, governance, HITL, checkpointing, cost & routing, observability, sandbox. Each declares the `components` it covers.
- **SDLC packs** map to practices — e.g. branching, commits & PRs, testing, release — and may require harness packs (testing feeds the verification loop).

Artifacts a pack emits carry `go-getter.generated-by` and `go-getter.pack-answer` (0007), so reconfiguration can find, diff and supersede them. Third-party packs are out of scope for v0.1.

## Why

"Almost any practice" needs an extensible, uniform structure; two families make coverage of the 12 components visible while keeping SDLC practices intuitive. Data packs are testable and load only what is in use.

## Tradeoffs considered

- **SDLC packs only, components as coverage tags**: simpler for users, but sandbox or observability have no natural home.
- **Harness-component packs only**: tidy mapping, but branching strategy as a guardrails sub-option is unintuitive.
- **One prose skill per domain / one monolithic init skill**: rejected earlier as inconsistent, untestable or token-heavy.
- **Cost accepted**: one extra concept (family) for users; the pack schema must be designed before the first pack.
