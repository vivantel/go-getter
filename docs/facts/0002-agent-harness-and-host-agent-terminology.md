---
id: 0002-agent-harness-and-host-agent-terminology
title: Meaning of "agent harness" and "host agent" in this project
status: active
date: 2026-10-04
tags: [harness, host-agents, positioning]
kind: decision
governed-by: 0015-configure-host-agent-harness-not-own-runtime
---

**Agent harness**: the infrastructure around an LLM that turns it into an autonomous agent; Agent = Model + Harness. Its 12 components:

1. Orchestration & execution loop
2. Tool registry & routing
3. Execution sandbox
4. Context window management
5. Short-term & long-term memory
6. Verification & self-correction loops
7. Guardrails & safety filters (incl. security, DLP, governance)
8. Human-in-the-loop gateways
9. State management & checkpointing
10. Multi-agent orchestration & communication
11. Token & cost management (incl. model routing)
12. Observability, logging & tracing

**Host agent**: Claude Code, Codex, Kilo, OpenCode, Cursor, Gemini CLI, GitHub Copilot — products that ship a partial harness and expose extension points. go-getter configures their harness.

"Harness" never means a host agent in this project's docs or code.
