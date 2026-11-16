---
id: 0213-skill-moves-from-kms
title: go-getter keeps roadmap, refactor-plan, brainstorm, clarify and changelog unchanged; kms deprecates its copies
status: active
accepted-by: sergemso
date: 2026-11-15
tags: [knowledge-base, packaging]
---

## Decision

kms deprecates `roadmap` (replaced by `decide`), `refactor-plan`, `brainstorm`, `clarify` and `changelog` for one release. go-getter keeps all five skills as they are. Folding `clarify` into `discover` and `changelog` into `release` is deferred to a later plan (no `release` skill exists yet).

## Why

Plans, options and release output are coordination work, not durable knowledge.

## Twin and status

Twin of kms `docs/decisions/0081-skill-moves-and-deprecation-window.md`. Accepted 2026-11-16 by the owner. Plan: kms `docs/plans/kms-core-and-go-getter-consolidation.md`, step D0.
