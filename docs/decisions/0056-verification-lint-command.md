---
id: 0056-verification-lint-command
title: The verification lint command is ""
status: active
date: 2026-10-05
tags: [practice-packs, verification, harness]
track: process
accepted-by: sergemso
go-getter:
  verify-lint-command: ""
  generated-by: verification-gate@0.1.0
  pack-answer: lint-command
  pack-option: ""
---

## Decision

Verification runs `` for the lint check; an empty command skips it (pack verification-gate@0.1.0).

## Why

The command is project-specific, so it is recorded as an answer rather than guessed at run time.
