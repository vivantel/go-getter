---
id: 0075-spec-tools-are-detected-and-tolerated
title: Spec and change tools such as OpenSpec are detected and tolerated, not wrapped by a pack
status: active
date: 2026-10-05
tags: [roadmap, tooling, practice-packs]
track: product
accepted-by: sergemso
governed-facts: [0029-openspec-layout-and-workflow]
---

## Decision

Supersedes 0073. In v0.3 go-getter detects a spec tool (OpenSpec first, by its `openspec/` directory) and tolerates it; it adds no spec-workflow pack, no tool adapter, no spec format and no validation or archive check of its own.

- `go-getter detect` reports the tool so the interview can prefill from it.
- A tool's own block in the instruction file coexists with go-getter's markers and counts toward the instruction cap (0033).
- `go-getter refs`, the `attribute` skill and the `conform` skill accept a change folder (`openspec/changes/<id>`, resolved under `archive/` after archiving, fact 0029) as a `Refs:` target and list it as must-have when the diff touches it.

A spec-workflow pack is reconsidered when a team asks for one; that is a new decision.

## Why

The owner doubted that go-getter should own a requirements workflow: the tool's commands and layout move independently of go-getter, parts of it are unconfirmed (fact 0029), and decisions, plans and `Refs:` trailers already link a commit to its why. Tolerating the tool keeps traceability without a second source of truth.

## Tradeoffs considered

- **Adapter pack over the tool (0073)**: validation, archive-on-merge and a change id per PR, but go-getter would track a tool it does not control.
- **Native spec format**: full control, but a large build that duplicates existing tools.
- **Cost accepted**: no enforcement that a change has a spec; the tool's own workflow stays manual.
