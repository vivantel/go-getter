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
  generated-by: git-workflow@0.1.0
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Guardrail

Open one pull request per branch. Merge it by squash, and only once its CI checks pass. Advisory (tier 1): nothing enforces it; hosting-platform settings (required checks, merge queue) are the project's to configure and go-getter cannot write them.
