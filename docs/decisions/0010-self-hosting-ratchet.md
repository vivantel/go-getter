---
id: 0010-self-hosting-ratchet
title: go-getter dogfoods itself from commit 0 through a self-hosting ratchet
status: active
date: 2026-10-04
tags: [dogfooding, ci, roadmap]
track: process
accepted-by: sergemso
fitness-functions:
  - CI regenerates this repo's own host files from its own knowledge-base artifacts and fails on drift
  - A release is blocked unless every shipped pack has been adopted by this repo
---

## Decision

Commit 0 uses the already-installed knowledge-base tooling to seed `docs/` plus a hand-written `AGENTS.md`. From then on, every pack go-getter ships must first be adopted by this repo through its own `init`; CI regenerates the repo's own host files from its own artifacts and fails on drift. This repo is the first fixture and eval for every pack — including routing, governance and telemetry, which run on this repo's own agent work.

## Why

The user requires dogfooding from the start; a ratchet keeps the product honest and surfaces friction before users meet it.

## Tradeoffs considered

- **Hand-written until `init` works, self-host from v0.1**: less constraint early, but go-getter would not follow its own rules for a window.
- **Also adopt in a sibling vivantel repo**: broader signal, but a second repo in every early change. Deferred.
- **Cost accepted**: slower early iteration, since a pack cannot ship until it is usable on this repo.
