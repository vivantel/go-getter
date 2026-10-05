---
id: 0024-model-tiers-and-host-providers
title: Priced models are grouped into small, medium and large tiers per provider, and each host agent is mapped to the providers whose models it can run
status: active
date: 2026-10-05
tags: [model-routing, cost, host-agents]
kind: derived
governed-by: 0016-quality-gated-cache-aware-model-routing
expires: 2027-01-04
go-getter:
  model-tiers:
    small: [claude-haiku-4-5, gpt-6-luna, gemini-3.1-flash-lite]
    medium: [claude-sonnet-5-5, gpt-6.1-sol, gemini-3.8-flash]
    large: [claude-opus-5-5, gpt-6-astra, gemini-3.1-pro-preview]
  host-providers:
    claude-code: [anthropic]
    codex: [openai]
    gemini-cli: [google]
    cursor: [anthropic, openai, google]
    kilo: [anthropic, openai, google]
    opencode: [anthropic, openai, google]
    copilot: []
---

Derived from the price facts 0011–0013 (same expiry basis) and the host facts 0003–0008. Routing treats the models of one tier as equally able to meet a task class's bar, so a tier is a quality class and price decides inside it.

- **Tiers**: per provider, the cheapest current model is small, a mid-priced current one is medium, the flagship is large. Models of the price facts that appear in no tier (older generations, `gpt-5.x`, `claude-fable-5-1`, `gemini-2.5-pro`, other flash variants) are never routed to.
- **Hosts**: Claude Code, Codex and Gemini CLI run their own provider's models. Cursor, Kilo and OpenCode run models of several providers, so the router also picks the provider. Copilot's model ids are not in the price facts (fact 0008 lists model choice per agent but no ids), so no model is compiled for it and routing stays advisory.
- **Not confirmed**: that `gemini-3.1-pro-preview` (a preview model) is an acceptable large tier for production use; that tiers of different providers are equivalent in quality — calibration (decision 0017) is meant to correct both.
