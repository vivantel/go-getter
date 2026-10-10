---
id: commit-subjects-are-conventional
title: Commit subjects must follow Conventional Commits
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
governed-by: 0100-branch-names
grounded-in: [0100-branch-names]
derivation-note: Given changelogs and release notes are generated from commit type prefixes, a non-conforming subject silently drops out of them.
go-getter:
  enforcement:
    - tier: 3
      check: Every non-merge commit not yet on the default branch has a Conventional Commits subject
      run: "builtin:commit-message pattern=\"^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)(\\([a-z0-9-]+\\))?!?: .+\""
  generated-by: git-workflow@0.1.0
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Guardrail

Commit subjects use `type(scope)?: summary` with a Conventional Commits type. Write them with the `attribute` skill where the project has it.
