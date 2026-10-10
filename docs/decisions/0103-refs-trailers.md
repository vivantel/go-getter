---
id: 0103-refs-trailers
title: Refs trailers are encouraged
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
track: process
accepted-by: sergemso
go-getter:
  generated-by: git-workflow@0.1.0
  pack-answer: refs
  pack-option: encouraged
---

## Decision

Commits link the decisions, facts and guardrails they implement with `Refs:` trailers, proposed by the attribute skill and listed in the pull request; nothing fails a commit without one (pack git-workflow@0.1.0).

## Why

A `Refs:` trailer links a commit to the decision, fact or guardrail it implements, so the reason for a change can be found from the code.
