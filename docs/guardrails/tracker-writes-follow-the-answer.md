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
      check: The host asks, or hands over, for the commands that write to the tracker, however go-getter is run
      run: builtin:gate-command classes="" go-getter="plan issue create,plan issue comment,plan issue close"
    - tier: 1
      check: Ask the user before running go-getter plan issue create, comment or close
  generated-by: tracker@0.3.0
  pack-answer: writes
  pack-option: ask
---

## Guardrail

The commands that write to the tracker (`plan issue create`, `comment`, `close`) need a human: do not run them yourself, ask the user to approve or run them. go-getter recognises them by what the call runs, so any way of running go-getter (the project runner, a user-level install, `npx`, `node <entry>`) is covered. A host whose hook can ask prompts once per call; hosts with native ask rules prompt for the usual spellings; the others get a hand-over from the pre-tool hook. Raw `gh issue` and `gh api` commands are covered by the human-approval guardrail of the hitl pack, not by this one.
