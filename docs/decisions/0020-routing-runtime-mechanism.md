---
id: 0020-routing-runtime-mechanism
title: Routing runs as compiled per-role defaults plus a delegation-time router hook, with hook-gated bounded escalation
status: active
date: 2026-10-04
tags: [model-routing, hooks, enforcement, cost]
track: product
accepted-by: sergemso
governed-facts: [0009-host-capability-matrix, 0003-claude-code-integration-surface, 0004-codex-integration-surface, 0006-cursor-integration-surface, 0007-gemini-cli-integration-surface]
---

## Decision

Routing (0016) executes in three layers:

1. **Compiled defaults (all seven hosts)**: each role's subagent definition gets the policy's default model and effort for its task class (0014).
2. **Delegation-time router (tier 2 where the host allows)**: a pre-delegation hook calls `go-getter route` with the task class, an estimate of the context to hand off (from the transcript) and cache warmth (time since the last request vs. TTL). It returns the cheapest eligible tier by expected total step cost (data-class filter first, 0018) and either rewrites the delegated model or advises keeping the work in the warm session.
3. **Verification-gated escalation**: when the verification gate fails, a stop hook blocks completion and re-dispatches one tier up; an escalation counter in `.go-getter/state/` enforces the policy's bound, after which the step is handed to a human.

| Host | Router lever | Escalation lever | Tier |
|-|-|-|-|
| Claude Code | `PreToolUse` on the Agent tool, `updatedInput.model` | `Stop` / `SubagentStop` block | 2 |
| Codex | `PreToolUse` on `spawn_agent`, `updatedInput` | `Stop` / `SubagentStop` block | 2 |
| Cursor | `preToolUse` on Task, `updated_input` | `stop` / `subagentStop` `followup_message` | 2 |
| Gemini CLI | `BeforeModel` model swap | `AfterAgent` block | 2 |
| Kilo | `tool.execute.before` on `task` (arg mutation unconfirmed) | none documented | 1–2 |
| OpenCode | `tool.execute.before` on `task` (arg mutation unconfirmed) | none documented | 1–2 |
| Copilot | none (only `preToolUse` deny) | `agentStop` (no block) | 1 |

Where a lever is missing, the delegation rules ship as instructions (tier 1) and the coverage report marks routing advisory for that host. Headless runs also set native spend caps where they exist (Claude Code `--max-budget-usd`, Copilot `--max-ai-credits`).

## Why

The user wants sophisticated, cache-aware routing; host research showed most hosts let a hook rewrite the delegation call, so routing can adapt per step without go-getter owning a runtime (0015).

## Tradeoffs considered

- **Compile-time only**: identical everywhere and simple, but ignores context size and cache warmth, losing most of 0016.
- **Advisory helper only**: portable, but depends on the agent remembering to ask (tier 1).
- **Cost accepted**: hook latency on every delegation; context and cache-warmth estimates from transcripts are approximate until calibration (0017); Copilot and possibly Kilo and OpenCode get advisory routing only.
