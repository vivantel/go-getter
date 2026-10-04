---
id: 0014-local-model-options
title: Local and custom model endpoints each host agent can use
status: active
date: 2026-10-04
tags: [governance, model-routing, host-agents]
kind: derived
governed-by: 0018-data-classes-constrain-routing-with-tiered-dlp
---

Derived from facts 0003–0008. Local endpoints have no per-token price; their cost is infrastructure and their eligibility is decided by data class (0018).

| Host | Local / custom inference | Constraint |
|-|-|-|
| Claude Code | `ANTHROPIC_BASE_URL` gateway, Bedrock / Google / Foundry, model pins | Endpoint must speak the Anthropic Messages API |
| Codex | `model_providers.<id>` (`base_url`, `env_key`), `--oss` with `oss_provider` | Provider keys user-level only |
| Kilo / OpenCode | `provider.<id>.options.baseURL` (OpenAI-compatible: Ollama, LM Studio) | Kilo project config can't interpolate env secrets |
| Cursor | not documented | — |
| Gemini CLI | none for inference (local Gemma only for routing decisions) | Gemini API / Vertex / OAuth only |
| Copilot | not documented | — |

Consequence: restricted data classes that require local-only inference can be served on Codex and Kilo/OpenCode; on Claude Code only through an Anthropic-API-compatible gateway; on Cursor, Gemini CLI and Copilot not at all (as documented).
