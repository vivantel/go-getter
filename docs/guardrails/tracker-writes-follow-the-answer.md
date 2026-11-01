---
id: tracker-writes-follow-the-answer
title: Writes to the plan tracker follow the project's answer
status: active
date: 2026-11-01
tags: [practice-packs, hooks, guardrail]
governed-by: 0160-tracker-writes
grounded-in: [0160-tracker-writes]
derivation-note: Given the project chose no prompt for plan writes, the rule rests on the agent keeping to the verbs and the step text.
go-getter:
  enforcement:
    - tier: 1
      check: Write to the tracker only through go-getter plan issue and only what the step says
  generated-by: tracker@0.3.0
  pack-answer: writes
  pack-option: allow
---

## Guardrail

Write to the tracker only through `go-getter plan issue create`, `comment` and `close`, never with raw `gh issue` commands, and only what the plan step says. Advisory (tier 1): nothing prompts for these verbs.
