---
id: 0223-pool-branch-pattern
title: Pool branches match `^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$`
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-branch-pattern: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
  generated-by: orchestration@0.1.6
  pack-answer: pool-branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Decision

`go-getter pool acquire --branch` refuses a name that does not match `^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$`. (pack orchestration@0.1.6).

## Why

A fixed pattern keeps branch names readable and lets merged-ness be decided from them.
