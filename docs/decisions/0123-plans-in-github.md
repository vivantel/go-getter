---
id: 0123-plans-in-github
title: Plan steps live in GitHub Issues
status: active
date: 2026-10-11
tags: [practice-packs, roadmap]
track: process
accepted-by: sergemso
go-getter:
  tracker: github
  generated-by: tracker@0.1.0
  pack-answer: tracker
  pack-option: github
---

## Decision

A plan step that names a GitHub issue (an `Issue:` field) takes its state from the issue: closed as completed is done, closed as not planned is moved, an open issue is not done. A step without an issue stays file-driven, and the plan file is never rewritten to match (pack tracker@0.1.0).

## Why

Work is visible where the team already tracks it, and issue text is read as data and never run as a command.
