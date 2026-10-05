---
id: human-escalation-rule
title: Agents must hand over to a human when blocked, before irreversible actions and on a guardrail denial
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, guardrail]
governed-by: 0043-human-escalation
grounded-in: [0043-human-escalation]
derivation-note: Given the escalation decision, an agent that routes around a denial defeats the guardrail.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction only
  generated-by: orchestration@0.1.0
  pack-answer: escalation
  pack-option: blocked-irreversible-denial
---

## Guardrail

Stop and ask a human when blocked, before irreversible or outward-facing actions, and when a guardrail denies an action. Advisory (tier 1).
