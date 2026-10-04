---
id: neutral-source-has-no-host-specific-language
title: Neutral source must not name a host agent or its tools
status: active
date: 2026-10-04
tags: [agent-agnostic, compiler, guardrail]
governed-by: 0005-neutral-source-compiler-architecture
grounded-in: [0005-neutral-source-compiler-architecture, 0002-six-host-agents-from-v0-1]
derivation-note: Given six host agents (0002) and one shared source (0005), host-specific wording in the source would be wrong on the other five, so variation must live in adapters and capabilities manifests.
go-getter:
  enforcement:
    - tier: 3
      check: "Skill, agent, command, rule and pack bodies under src/ contain no host-agent or host-tool names"
      run: "npm run check:neutral"
---

## Guardrail

Skill, agent, command, rule and pack content says "the agent" and describes capabilities, never a specific host agent or its tools. Host-specific variation belongs only in `compiler/adapters/` and `compiler/capabilities/`.
