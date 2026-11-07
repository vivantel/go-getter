---
id: working-a-change
title: Work a change from branch to merge
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, procedural]
operationalizes: [branch-names-follow-the-pattern, commit-subjects-are-conventional, changes-land-as-one-squashed-pull-request]
go-getter:
  generated-by: git-workflow@0.1.3
  pack-answer: branch-pattern
  pack-option: ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$
---

## Procedure

1. Start from the default branch and create a branch named for the change: `git switch -c <type>/<slug>`.
2. Commit with a Conventional Commit subject (`type: summary`) and a body that says why.
3. Before the pull request, do the preparation yourself: run the project's knowledge capture, conformance and lint checks and write the commit message and description, then fix what they find. Hand a person only gated actions (an approval, a write a guardrail gates), each as one question through the host's question tool where it has one, never a list of steps for them to do.
4. Push the branch and open one pull request for it.
5. When CI is green, squash merge the pull request and delete the branch.
6. After `go-getter ship` confirms the merge, it removes the task's worktree from the main checkout when the remote branch is gone or the branch or its pull request is merged, and nothing is uncommitted (the rule of `go-getter worktree clean`); it keeps the local branch and prints the main checkout path, where you continue. Gitignored files in a removed worktree are deleted with it. `go-getter plan start --worktree` at the concurrency limit runs the same clean once and retries once before refusing; that clean can remove a worktree whose remote branch is gone even if another session still uses it, so finish or push work before its branch is merged or closed.
