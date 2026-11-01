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
      check: Use go-getter ship for commit-to-merge where no hook denies the raw commands
    - tier: 2
      check: The pre-tool hook denies a raw git push, gh pr create or gh pr merge and names the verb
      run: builtin:redirect-to-verb verbs="git-push=go-getter ship,pr-create=go-getter ship,pr-merge=go-getter ship"
---

## Guardrail

Use `go-getter ship` and `go-getter release --batch` for commit-to-merge and release. A raw `git push`, `gh pr create`, `gh pr merge` or release sequence that a verb covers is denied with the verb's name. Hosts with a blocking pre-tool hook deny them; the others rely on the instruction. A person may still run the raw command themselves.
