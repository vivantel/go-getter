---
id: 0073-spec-workflow-through-a-tool-adapter
title: The spec and change workflow is an SDLC pack over a spec-tool adapter, OpenSpec first, with no native spec format
status: superseded
superseded-by: 0075-spec-tools-are-detected-and-tolerated
date: 2026-10-05
tags: [roadmap, practice-packs, tooling]
track: product
accepted-by: sergemso
governed-facts: [0029-openspec-layout-and-workflow]
---

## Decision

In v0.3 an SDLC pack (0008) adds a spec workflow. It talks to the spec tool through an adapter (detect, validate, list changes, archive) and ships the OpenSpec adapter first; the tool runs through `npx` and is never a dependency (0023, guardrail `no-runtime-dependencies`). The pack's answers decide whether feature and fix changes need a change id, record it as a `Refs:` trailer (`openspec/changes/<id>`, resolved under `archive/` once archived, since archiving moves the folder, fact 0029), run the tool's validation as a verification check, and archive the change when its PR merges.

Specs mutate through the tool's deltas; knowledge-base decisions stay immutable, and a decision made inside a change's design is captured as a decision. go-getter defines no spec or change format of its own. If the tool writes its own block into the instruction file (unconfirmed, fact 0029), that block must coexist with go-getter's markers and counts toward the instruction cap (0033).

## Why

OpenSpec is a living-requirements workflow built for AI assistants on 30+ tools; rebuilding it would duplicate it, and go-getter's value is wiring it into attribution, verification and the git workflow.

## Tradeoffs considered

- **Detect and coexist only**: cheap, but no traceability from a commit to a change.
- **Native format**: full control and no external tool, but a large build that competes with existing tools.
- **Cost accepted**: tool details are partly unconfirmed (fact 0029) and a spec tool becomes a prerequisite of that pack's answers.
