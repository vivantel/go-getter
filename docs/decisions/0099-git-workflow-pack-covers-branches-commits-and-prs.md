---
id: 0099-git-workflow-pack-covers-branches-commits-and-prs
title: The git-workflow pack covers branches, commits and pull requests, and one change is one branch and one PR
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, milestones]
track: product
accepted-by: sergemso
---

## Decision

Implements the v0.3 item of 0068 (backlog L.1). The `git-workflow` SDLC pack covers:

- **Branches**: a name pattern, default `type/slug` with the Conventional Commit types, and no commits or pushes to the default branch. A git hook enforces both (tier 3); where no hook runs, an instruction states them.
- **Commits**: Conventional Commit subjects (guardrail `commit-subjects-are-conventional`). `Refs:` trailers are a question (required, encouraged or off), default encouraged: the `attribute` skill proposes them and no hook fails a commit without one.
- **Pull requests**: squash merge, CI green before merge.
- **Change unit**: one change is one branch and one PR; the branch slug is the change id. Spec-tool support (L.2, 0075) matches that id to the tool's change.

Out of scope: worktrees and parallel tasks (orchestration pack), release and tagging (later), and the rule that commits carry no AI-tool attribution lines, which stays this repo's local decision 0024 and is not a question.

Adopting the pack in this repo replaces the "Workflow (interim)" section of `AGENTS.md`. 0068 stays active for the order of v0.3 and later; only its interim-workflow clause is spent.

## Why

The interim workflow lives in prose that every adopting project would have to rewrite, and only the commit subject is checked. Branch naming and the default-branch rule are cheap to enforce in a git hook, and the change unit is what L.2 needs.

## Tradeoffs considered

- **Worktrees in the pack**: one place for all git rules, but it overlaps orchestration and needs a split.
- **Release in the pack**: pulls forward a topic 0068 lists under "Later".
- **Refs required on every commit**: strongest traceability, but unusable for projects without a knowledge base.
- **Separate `Change:` trailer**: an explicit link for L.2, at the cost of a second rule to enforce.
