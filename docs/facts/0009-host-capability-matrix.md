---
id: 0009-host-capability-matrix
title: Capability matrix of the six host agents
status: active
date: 2026-10-04
tags: [host-agents, harness, compiler, enforcement]
kind: derived
governed-by: 0005-neutral-source-compiler-architecture
---

Derived from facts 0003 (Claude Code, CC), 0004 (Codex, CX), 0005 (Kilo, KI; OpenCode, OC), 0006 (Cursor, CU), 0007 (Gemini CLI, GE), 0008 (Copilot, CP); output and read levers from 0027 and 0031. `?` = unconfirmed in the source fact.

## Extension points

| | CC | CX | KI | OC | CU | GE | CP |
|-|-|-|-|-|-|-|-|
| Instruction file | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` (falls back to `CLAUDE.md`) | `AGENTS.md` (falls back to `CLAUDE.md`) | `AGENTS.md`, `.cursor/rules/*.mdc` | `GEMINI.md` (`context.fileName` configurable) | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` |
| Skills dirs read | `.claude/skills` | `.agents/skills` | `.kilo`, `.claude`, `.agents` | `.opencode`, `.claude`, `.agents` | `.cursor`, `.agents`, `.claude`, `.codex` | `.gemini`, `.agents` | `.github`, `.claude`, `.agents` |
| Subagent format | `.claude/agents/*.md` | `.codex/agents/*.toml` | `.kilo/agents/*.md` (assumed to mirror OpenCode; unconfirmed) | `.opencode/agents/*.md` | `.cursor/agents/*.md` (also reads `.claude/`, `.codex/`) | `.gemini/agents/*.md` | `.github/agents/*.agent.md` |
| Commands | merged into skills | skills only | `.kilo/commands/*.md` (assumed to mirror OpenCode; unconfirmed) | `.opencode/commands/*.md` | migrated to skills | `.gemini/commands/*.toml` | skills/agents |
| Blocking pre-tool hook | yes | yes | yes (plugin throws) | yes (plugin throws) | yes | yes | yes (`preToolUse` only) |
| Path read deny | `Read(...)` rules, sandbox | hooks; permission profiles (sandboxed commands) | `permission.read` | `permission.read` | `beforeReadFile`, CLI `Read(...)`, `.cursorignore` | hooks / `argsPattern` | hooks; `--deny-tool='read(PATH)'` flag |
| Replace tool output | `updatedToolOutput` | block `reason` | `tool.execute.after` | ? | MCP tools only | deny `reason` | `modifiedResult` |
| Per-agent model | yes | yes | yes | yes | yes | yes | yes |
| Effort control | yes (`effort`) | yes (`model_reasoning_effort`) | yes (variants) | yes (variants) | yes (`[effort=...]`) | no | ? |
| Model swap by hook | `PreModelSwitch` (gate only) | no | no | no | no | `BeforeModel` | no |
| Local/custom endpoint | gateway / `ANTHROPIC_BASE_URL` | `model_providers`, `--oss` | `provider.baseURL` | `provider.baseURL` | ? | no | ? |
| Cache tokens visible | yes | yes (`cached_input_tokens`) | ? | ? | billing only | yes (`/stats`, OTel) | ? |
| Telemetry export | OTel | OTel | ? | ? | no | OTel (prompts logged by default) | ? |
| Cost reported | yes (`cost_usd`) | no | ? | ? | dashboard | no | ? |
| Spend cap | `--max-budget-usd` (print mode) | no | no | no | no | no | `--max-ai-credits` (autopilot) |
| Checkpoint/restore | `/rewind` (file tools) | ? | ? | ? | ? | shadow git `/restore` | git/PR (cloud agent) |
| Plugin packaging | `.claude-plugin/plugin.json` + marketplace | `plugin.json` / `.codex-plugin/` + `.agents/plugins/marketplace.json` | npm plugins, remote config, remote `skills.urls` manifest | npm plugins, remote config | `.cursor-plugin/` or Agent Plugins 1.0 | `gemini-extension.json` | Agent Plugins 1.0 or legacy |
| Node at runtime | not required | not required | Bun for plugins; npm install | Bun for plugins; npm install | not required | required (≥20) | npm install needs ≥22; else ? |

## Highest enforcement tier reachable inside the host (per 0009)

Tier 3 (git hooks + CI) is available for every host and is omitted. `2` = a blocking host hook or permission exists; `1` = instruction only; `–` = component has no host lever.

| Component | CC | CX | KI | OC | CU | GE | CP |
|-|-|-|-|-|-|-|-|
| 3 Sandbox | 2 | 2 | – | – | 2 | 2 | 2 (cloud firewall) |
| 6 Verification loop (block stop) | 2 | 2 | 1 | 1 | 2 | 2 | 1 |
| 7 Guardrails / DLP | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| 8 Human-in-the-loop | 2 | 2 | 2 | 2 | 2 | 2 | 1 |
| 9 Checkpointing | 2 | 1 | 1 | 1 | 1 | 2 | 1 |
| 10 Multi-agent roles (tools/model per agent) | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| 11 Cost & routing (per-agent model; hard cap) | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| 12 Observability (export) | 2 | 2 | 1 | 1 | 1 | 2 | 1 |

## Symlink / shared-file candidates
- **Instructions**: canonical `AGENTS.md`; `CLAUDE.md` → `AGENTS.md` (CC); Gemini via `context.fileName: ["AGENTS.md"]` (setting, not a symlink).
- **Skills**: canonical `.agents/skills/` (read by CX, KI, OC, CU, GE, CP); `.claude/skills` → `.agents/skills` for CC.
- **Subagents**: no shared format; CU reads `.claude/agents/` but with different frontmatter semantics — emit per host.
- **Plugin manifest**: CU and CP share the Agent Plugins 1.0 `plugin.json` schema; CX's portable root `plugin.json` may be the same (?).
