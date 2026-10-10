---
id: working-a-change
title: Work a change from branch to merge
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, procedural]
operationalizes: [branch-names-follow-the-pattern, commit-subjects-are-conventional, changes-land-as-one-squashed-pull-request]
go-getter:
  generated-by: git-workflow@0.1.0
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Procedure

1. Start from the default branch and create a branch named for the change: `git switch -c <type>/<slug>`.
2. Commit with a Conventional Commit subject (`type: summary`) and a body that says why.
3. Push the branch and open one pull request for it.
4. When CI is green, squash merge the pull request and delete the branch.
