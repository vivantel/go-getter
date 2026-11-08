---
id: a-real-world-effect-stays-inside-its-cap
title: A money, physical or legal effect stays inside the cap its grant carries, and an unclassed action is not delegated
status: active
date: 2026-11-03
tags: [coordination, security, guardrail]
governed-by: 0180-real-world-effects-are-classed-in-grants-and-delegable-only-inside-a-human-written-cap
grounded-in: [0180-real-world-effects-are-classed-in-grants-and-delegable-only-inside-a-human-written-cap, 0171-grants-only-narrow-down-the-delegation-tree]
derivation-note: Given that a real-world effect may not be undoable, the human-written cap is the only bound on what a delegated worker can cause.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; act in the world only inside the cap of your grant, and ask when an action's class is unknown
    - tier: 2
      check: The pre-tool hook denies a raw tool that docs/effects.md maps to a money, physical or legal effect, naming go-getter act, which refuses an unmapped action and an effect above the cap
      run: builtin:deny-effect-tools
---

## Guardrail

Take a money, physical or legal action only through `go-getter act` and inside the cap in your grant. An action whose class is unknown, or that would exceed the cap, is not taken: park the unit with an ask (0168). `go-getter act` refuses an unmapped action and an effect above a cap, and logs each effect as metadata. Hosts with a blocking pre-tool hook deny the raw tools (tier 2); elsewhere it stays an instruction, and `go-getter coverage` says which hosts and worker kinds have the verb as the sole path.
