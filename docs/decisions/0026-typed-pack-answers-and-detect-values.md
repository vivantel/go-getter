---
id: 0026-typed-pack-answers-and-detect-values
title: Pack questions can take typed free-text and list answers, and templates can use detected values
status: active
date: 2026-10-05
tags: [practice-packs, interview, configuration]
track: process
accepted-by: sergemso
---

## Decision

Extends 0022. A question has `type: choice | text | list` (default `choice`). `text` and `list` questions have no options; their answer may be validated by an optional `pattern` regex (each item, for lists) and may carry a `default`. `{{answer.<q>}}` substitutes the value as given (lists comma-joined). Templates may use `{{detect.<key>}}`; `go-getter detect` additionally reports `commands.test`, `commands.lint` and `commands.typecheck` when it can infer them, and a `detect` key on a text question prefills it.

## Why

Governance (custom restricted paths, model registry), verification (check commands) and telemetry (endpoints) need project-specific values; choice-only packs would force hand edits that `reconfigure` would overwrite.

## Tradeoffs considered

- **Detection only**: no free text, but anything detection misses must be hand-edited afterwards.
- **A separate values file**: simple, but a second source of truth, which 0007 rejected.
