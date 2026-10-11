---
id: 0115-use-commands
title: The commands approved to receive a use path are listed
status: active
date: 2026-10-11
tags: [practice-packs, governance, security]
track: process
accepted-by: sergemso
go-getter:
  use-commands: ""
  generated-by: governance@0.5.0
  pack-answer: use-commands
  pack-option: []
---

## Decision

Only the commands [] may receive a use path through `go-getter secret run`, each for its own pattern (pack governance@0.5.0); with none listed `secret run` refuses every command.

## Why

Scrubbing an exact value cannot catch a re-encoded one, so a human decides which commands may hold a secret (decision 0107).
