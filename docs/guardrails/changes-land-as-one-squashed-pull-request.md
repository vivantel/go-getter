---
id: changes-land-as-one-squashed-pull-request
title: A change lands as one squashed pull request with green CI
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
governed-by: 0100-branch-names
grounded-in: [0100-branch-names]
derivation-note: Given one change is one branch and one pull request, the history keeps one commit per change only if the merge squashes, and a red pull request must not merge.
go-getter:
  enforcement:
    - tier: 1
      check: Merge a pull request only when its CI checks pass, and squash it into one commit on the default branch
    - tier: 3
      check: The head of the default branch is a single-parent commit (a squash), checked on a push to it in CI
      run: builtin:squash-merged-head
      origin: derived
  generated-by: git-workflow@0.1.3
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Guardrail

Open one pull request per branch. Merge it by squash, and only once its CI checks pass. CI fails when the head of the default branch is a merge commit (tier 3, squash only). Advisory (tier 1) for the rest: whether CI passed before the merge, and one pull request per branch, are hosting-platform settings (required checks, merge queue) that are the project's to configure and go-getter cannot write.
