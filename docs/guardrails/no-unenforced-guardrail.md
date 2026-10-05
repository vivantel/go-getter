---
id: no-unenforced-guardrail
title: A guardrail describing a shipped skill's behavior must also be stated in that skill
status: active
date: 2026-10-04
tags: [knowledge-management, guardrail]
governed-by: 0066-own-the-knowledge-base-tooling
grounded-in: [0066-own-the-knowledge-base-tooling]
derivation-note: Given knowledge-base artifacts are the source of truth (0066) but agents running a skill read only its body, a rule about that skill's behavior that lives only in docs/guardrails/ never reaches them.
go-getter:
  enforcement:
    - tier: 1
      check: "knowledge-base lint check 8 (unenforced guardrails)"
---

## Guardrail

If a guardrail describes what a shipped skill must do, that skill's own body says it too. Advisory (tier 1 only): judged by `go-getter:lint`.
