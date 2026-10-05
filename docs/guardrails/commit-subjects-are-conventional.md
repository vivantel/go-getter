---
id: commit-subjects-are-conventional
title: Commit subjects must follow Conventional Commits
status: active
date: 2026-10-05
tags: [git-hooks, ci, guardrail]
governed-by: 0004-milestone-sequence-foundation-then-agent-practices
grounded-in: [0004-milestone-sequence-foundation-then-agent-practices]
derivation-note: Given the interim workflow requires Conventional Commit titles (0004) and changelogs are generated from their type prefixes, a non-conforming subject silently drops out of the changelog.
go-getter:
  enforcement:
    - tier: 3
      check: "Every non-merge commit not yet on main has a Conventional Commits subject"
      run: 'builtin:commit-message pattern="^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)(\([a-z0-9-]+\))?!?: .+" base=origin/main'
---

## Guardrail

Commit subjects use `type(scope)?: summary` with a Conventional Commits type. Write them with the `attribute` skill.
