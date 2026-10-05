---
id: 0055-verification-test-command
title: The verification test command is "npm test"
status: active
date: 2026-10-05
tags: [practice-packs, verification, harness]
track: process
accepted-by: sergemso
go-getter:
  verify-test-command: npm test
  generated-by: verification-gate@0.1.0
  pack-answer: test-command
  pack-option: npm test
---

## Decision

Verification runs `npm test` for the test check; an empty command skips it (pack verification-gate@0.1.0).

## Why

The command is project-specific, so it is recorded as an answer rather than guessed at run time.
