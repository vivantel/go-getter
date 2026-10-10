---
id: 0108-secret-scan
title: Secrets in added lines are scanned before a commit and a push
status: active
date: 2026-10-10
tags: [practice-packs, governance, security]
track: process
accepted-by: sergemso
go-getter:
  generated-by: governance@0.3.0
  pack-answer: secret-scan
  pack-option: on
---

## Decision

A git hook before a commit, a git hook before a push and CI scan the lines a change adds for private keys, provider tokens, JWTs and labelled secret assignments, and fail with the file, line and kind (pack governance@0.3.0). A line marked `go-getter:allow-secret` and the paths compiler/test/** are skipped.

## Why

A credential that reaches a repository must be rotated, and a pattern scan on the lines being added stops it without reading history (decision 0106).
