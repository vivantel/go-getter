---
id: no-commits-on-the-default-branch
title: Work must not happen on the default branch
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
governed-by: 0102-default-branch
grounded-in: [0102-default-branch]
derivation-note: Given every change goes through a branch and a pull request, a commit or push on the default branch skips review and CI.
go-getter:
  enforcement:
    - tier: 3
      check: The current branch, or the pull request head in CI, is not the default branch
      run: builtin:not-on-default-branch
    - tier: 1
      check: Never commit or push to the default branch; create a `type/slug` branch first
  generated-by: git-workflow@0.1.0
  pack-answer: default-branch
  pack-option: protect
---

## Guardrail

Never commit or push on the default branch; work on a branch and open a pull request. A git hook refuses it when the checked-out branch is the default branch. A push from another branch to the default branch's name (`git push origin feat:main`) is not detected.
