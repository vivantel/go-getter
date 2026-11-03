---
id: 0041-coordination-hotspots-and-contradictions-in-the-current-design
title: Where the current design assumes one owner, one machine and shared files, and what contradicts at scale
status: active
date: 2026-11-03
tags: [coordination, roadmap, architecture]
kind: environmental
last-verified: 2026-11-03
---

Read from the repository on 2026-11-03 for the reframing of decisions 0165-0175.

**Single-owner and single-machine assumptions**
- Human attention is one person: "the owner" in 0154-0159, `accepted-by: sergemso`, the run record per user (0130), the digest as one sitting (`reviewing-the-daily-digest`).
- Concurrency is `max-concurrent: 10` per project, enforced by `go-getter worktree new` on one machine (0156).
- Step conflicts are detected by whether two `Do` texts name the same file path (`compiler/src/runs/next.mjs`, roadmap step T6).

**Shared files every change touches**
- The 2026-11-01 `roadmap.md` held one Status board and a `Progress` line per step, rewritten "in the same commit as the work" (its Resume protocol, items 3-5): every PR edited the same file.
- Each new decision, fact, guardrail or procedure adds a row to one of four `INDEX.md` files (`AGENTS.md`), and decisions and facts take the "next free number" (`shared/artifact-model.md`), so parallel PRs collide on the row and on the number.
- `go-getter plan` parses `Needs` within one plan only; splitting the roadmap on 2026-11-03 made `npm run check:plans` fail on T4 and T8 until their cross-plan dependencies were moved into prose.

**Validation is defined at the PR level only**
- 0158 gates a PR (Check, conform, reviewer, CI) and samples about 20% of merged PRs; 0013 gates a release. No decision validates a plan, a feature or the integrated product between those.

**Contradictions this creates (resolved by 0165-0175)**
- Roadmap Resume protocol (in-commit `Progress`) against one squashed pull request per step (the git-workflow practice): the board is edited in every step's PR.
- 0155 "the owner approves a plan once" and 0130 "starting a run is the human act" against delegation through many levels and workers.
- 0156 "10 agents at once, steps that touch the same files are not run together" against thousands of units on several machines.
- 0117 "Hierarchy: none in the first version" against a feature that one owner decomposes into plans.
- 0158 "the owner reads about 20% of merged PRs" against a volume no owner can read.
