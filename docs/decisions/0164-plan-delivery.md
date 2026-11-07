---
id: 0164-plan-delivery
title: A plan is delivered one pull request per step
status: draft
date: 2026-11-03
tags: [practice-packs, git-hooks, guardrail]
track: process
go-getter:
  generated-by: git-workflow@0.1.3
  pack-answer: plan-delivery
  pack-option: per-step
---

## Decision

Each step of a plan is its own change: a branch named for the step, one pull request, merged by squash once CI is green, after which the step's issue closes. Steps marked as parallel with no shared files may run at the same time, each in its own worktree. `go-getter ship` takes a step from working tree to merge (pack git-workflow@0.1.3).

## Why

Small pull requests are reviewed and reverted one at a time, and the plan's status follows the merged state of its issues.
