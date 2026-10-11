---
id: tracker-writes-follow-the-answer
title: Writes to the plan tracker follow the project's answer
status: active
date: 2026-10-11
tags: [practice-packs, hooks, guardrail]
governed-by: 0124-tracker-writes
grounded-in: [0124-tracker-writes]
derivation-note: Given plan writes are visible to others, the project asked for a human on each, which the host must enforce since an instruction alone fails silently.
go-getter:
  enforcement:
    - tier: 2
      check: Host ask rules and the pre-tool hook gate the commands that write to the tracker
      run: builtin:gate-command classes="" extra="go-getter plan issue create, go-getter plan issue comment, go-getter plan issue close, .go-getter/bin/go-getter plan issue create, .go-getter/bin/go-getter plan issue comment, .go-getter/bin/go-getter plan issue close, node compiler/bin/go-getter.mjs plan issue create, node compiler/bin/go-getter.mjs plan issue comment, node compiler/bin/go-getter.mjs plan issue close"
    - tier: 1
      check: Ask the user before running go-getter plan issue create, comment or close
  generated-by: tracker@0.1.0
  pack-answer: writes
  pack-option: ask
---

## Guardrail

The commands that write to the tracker (`plan issue create`, `comment`, `close`) need a human: do not run them yourself, ask the user to approve or run them. Hosts with project ask rules prompt natively; the others get a hand-over from the pre-tool hook. Raw `gh issue` and `gh api` commands are covered by the human-approval guardrail of the hitl pack, not by this one.
