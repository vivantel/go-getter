---
id: 0133-verification-coverage-command
title: The verification coverage command is ""
status: draft
date: 2026-10-11
tags: [practice-packs, verification, harness]
track: process
go-getter:
  verify-coverage-command: ""
  generated-by: verification-gate@0.4.0
  pack-answer: coverage-command
  pack-option: ""
---

## Decision

Verification runs `` for the coverage check, where the machine profile places it; an empty command skips it (pack verification-gate@0.4.0).

## Why

The command is project-specific, so it is recorded as an answer rather than guessed at run time. This pack owns coverage; no other pack asks about it.
