---
id: pack-questions-have-a-recommended-default
title: Every choice question in a pack must name exactly one recommended option
status: active
date: 2026-10-05
tags: [practice-packs, interview, guardrail]
governed-by: 0003-guided-interview-only-setup
grounded-in: [0003-guided-interview-only-setup, 0026-typed-pack-answers-and-detect-values]
derivation-note: Given setup is an interview whose fast path is accepting recommended defaults (0003), a choice question without one breaks "accept the rest" and forces a decision the pack should have proposed.
go-getter:
  enforcement:
    - tier: 3
      check: "Each choice question has exactly one option with recommended: true; text/list questions have a default or a detect key"
      run: "npm run check:packs"
---

## Guardrail

Every `choice` question marks exactly one option `recommended`; every `text`/`list` question has a `default` or a `detect` key.
