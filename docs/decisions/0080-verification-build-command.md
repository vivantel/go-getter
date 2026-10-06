---
id: 0080-verification-build-command
title: The verification build command is ""
status: active
date: 2026-10-06
tags: [practice-packs, verification, harness]
track: process
accepted-by: sergemso
go-getter:
  verify-build-command: ""
  generated-by: verification-gate@0.2.0
  pack-answer: build-command
  pack-option: ""
---

## Decision

Verification runs `` for the build check, where the machine profile places it; an empty command skips it (pack verification-gate@0.2.0).

## Why

The command is project-specific, so it is recorded as an answer rather than guessed at run time.
