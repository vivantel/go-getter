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
    - tier: 2
      check: The pre-tool hook denies a raw gh issue create, comment or close and names go-getter plan issue
      run: builtin:deny-raw-tracker-writes
      origin: derived
  generated-by: tracker@0.3.0
  pack-answer: writes
  pack-option: allow
---

## Guardrail

Write to the tracker only through `go-getter plan issue create`, `comment` and `close`, never with raw `gh issue` commands, and only what the plan step says. Hosts with a blocking pre-tool hook deny a raw `gh issue create`, `comment` or `close` (tier 2); elsewhere this is advisory (tier 1). A person may still run the raw command. `go-getter plan issue` runs `gh` itself, so the verb is never blocked.
