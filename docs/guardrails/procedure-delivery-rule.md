---
id: procedure-delivery-rule
title: Detailed procedures live in skills loaded on demand
status: active
date: 2026-10-05
tags: [practice-packs, harness, guardrail]
governed-by: 0034-procedure-delivery
grounded-in: [0034-procedure-delivery]
derivation-note: Given the delivery decision, procedures placed elsewhere cost tokens or go unread.
go-getter:
  enforcement:
    - tier: 1
      check: Procedures follow the delivery decision; reviewed in PRs
  generated-by: context@0.2.0
  pack-answer: procedures
  pack-option: skills-on-demand
---

## Guardrail

Keep procedures in skills, not in the always-loaded instruction file.
Advisory (tier 1 only).
