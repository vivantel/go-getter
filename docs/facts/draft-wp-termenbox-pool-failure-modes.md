---
id: draft-wp-termenbox-pool-failure-modes
title: Termenbox's shell worktree pool failed nine measured ways on 2026-11-21, which are the reproduction fixtures for go-getter's pool
status: draft
date: 2026-11-21
tags: [practice-packs, harness, verification]
last-verified: 2026-11-21
---

Measured on termenbox's pool of 20 slots on 2026-11-21: 2 free at the start; 15 claimed, of which 2 held real work and 13 were leftovers; 6 more were unmanaged. Each case below is a test in `compiler/test/pool-failures.test.mjs` (plan `docs/plans/worktree-pool.md`, WP1) that fails for the stated reason until the named step lands.

| # | Failure | Count | Fixed by |
|---|---|---|---|
| 1 | An untracked build-output directory, ignored on one branch only, made a free slot unmanaged; reap never freed it | 6 slots | WP3 |
| 2 | Squash merges not recognised: a closed pull request whose content is in the base, and a local commit whose patch landed under another hash, refused as unique | 2 closed PRs, 1 slot | WP4 |
| 3 | Slots that were ancestors of the base stayed claimed because they held untracked test or scratch files | 2 slots | WP4 |
| 4 | A lease whose branch ref was gone was kept forever | 1 slot | WP4 |
| 5 | No owner liveness: the recorded pid was the short-lived script, and named slots of ended sessions stayed claimed | 15 claimed slots, 13 leftovers | WP5 |
| 6 | Worktrees beside the pool, and an orphan directory of 535 MB, were invisible to the pool | 3 worktrees, 1 directory | WP6 |
| 7 | Agents are denied raw `git worktree remove`, and the pool had no verb to remove or release an unmanaged worktree | all agents | WP6 |
| 8 | Releasing 3 slots showed "free: 3" while 5 were available, because cold slots were not counted | 3 releases | WP3 |
| 9 | Stashes are shared by every slot and tied to none | 2 stashes visible in every slot | WP6 |

Names of slots, branches and pull requests are left out; the fixtures recreate each shape on a throwaway origin.
