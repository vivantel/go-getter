---
id: 0101-change-unit
title: One change is one branch and one pull request
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
track: process
accepted-by: sergemso
go-getter:
  generated-by: git-workflow@0.1.0
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Decision

A change is one branch and one pull request, and the slug of the branch is the change id. Commits follow Conventional Commits; the pull request is squash merged once CI is green (pack git-workflow@0.1.0).

## Why

A stable change id lets tools that track changes (a spec tool, a changelog) match a change to its branch and pull request.
