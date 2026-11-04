---
id: paper-numbers-are-reproducible
title: Every figure in the paper cites a command that reproduces it and the side of an intervention it comes from
status: active
date: 2026-11-04
tags: [research, verification, guardrail]
governed-by: 0199-we-publish-a-position-and-system-paper-and-may-change-go-getter-to-support-it
grounded-in: [0199-we-publish-a-position-and-system-paper-and-may-change-go-getter-to-support-it]
derivation-note: Given that go-getter may change toward its own claims (0199 items 5 to 7), a number is only evidence if a reader can reproduce it and tell baseline from treatment.
go-getter:
  enforcement:
    - tier: 1
      check: The plan's review step and the owner's acceptance (0199 item 4) reject a figure without a reproducing command and a baseline or treatment label
---

## Guardrail

Each number, table and plot in the paper states the command or ref that produces it and whether it is baseline or treatment against the cutoff in the plan. A figure without both is not accepted. Agent-drafted claims are accepted only by the owner. Advisory (tier 1).
