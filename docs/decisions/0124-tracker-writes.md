---
id: 0124-tracker-writes
title: go-getter may write to the tracker with a human approving each write
status: active
date: 2026-10-11
tags: [practice-packs, roadmap]
track: process
accepted-by: sergemso
go-getter:
  tracker-writes: ask
  generated-by: tracker@0.1.0
  pack-answer: writes
  pack-option: ask
---

## Decision

`go-getter plan issue create`, `comment` and `close` write to the tracker only after a human approves the command (pack tracker@0.1.0); a dry run and every read need no approval.

## Why

Writing is outward-facing and visible to others; the text sent is checked for secrets and personal data first.
