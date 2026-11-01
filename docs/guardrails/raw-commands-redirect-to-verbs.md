---
id: raw-commands-redirect-to-verbs
title: When a go-getter verb covers an action, the raw git or gh form is denied with a pointer to the verb
status: active
date: 2026-11-01
tags: [hooks, enforcement, guardrail]
governed-by: 0157-routine-actions-run-through-a-ship-verb-and-raw-equivalents-are-redirected
grounded-in: [0157-routine-actions-run-through-a-ship-verb-and-raw-equivalents-are-redirected, 0040-oct-31-throughput-baseline-and-friction]
derivation-note: Given verbs that are token-free and have one allow-rule, hand-run equivalents only add cost and classifier denials.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction until the redirect hook ships (plan `docs/plans/roadmap.md` step T4 raises this to tier 2 with a run)
---

## Guardrail

Use `go-getter ship` and `go-getter release --batch` for commit-to-merge and release. A raw `git push`, `gh pr create`, `gh pr merge` or release sequence that a verb covers is denied with the verb's name. Advisory (tier 1) until the redirect hook ships.
