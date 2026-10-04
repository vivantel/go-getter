---
id: 0002-six-host-agents-from-v0-1
title: v0.1 supports six host agents - Claude Code, Codex, Kilo/OpenCode, Cursor, Gemini CLI, GitHub Copilot
status: active
date: 2026-10-04
tags: [host-agents, agent-agnostic, packaging]
track: product
accepted-by: sergemso
---

## Decision

From v0.1, go-getter configures the harness of six host agents: Claude Code, Codex, Kilo Code/OpenCode, Cursor, Gemini CLI and GitHub Copilot (agent mode / coding agent). Adding a host agent later follows `docs/skills/adding-a-host-agent.md`.

## Why

The user wants the widest reach from the start; teams mix host agents, and "zero friction" fails if theirs is unsupported.

## Tradeoffs considered

- **Claude Code first with a neutral core** (assistant's recommendation): fastest v0.1, delays reach. Rejected by the user.
- **Claude Code only**: deepest integration, hard to reuse later. Rejected.
- **Cost accepted**: hosts expose different harness extension points (hooks, permissions, per-agent models, telemetry), so each component needs a per-host mapping or a fallback. Mitigated by the compiler (0005) and tiered enforcement with a host-independent floor (0009).
