---
id: 0035-host-specific-branches-in-the-compiler-and-runtime
title: Host knowledge sits in thirteen places across the compiler and the runtime; capability rows are the only data-driven part
status: active
date: 2026-10-12
tags: [architecture, compiler, host-agents, hooks]
kind: derived
governed-by: 0118-extension-architecture-core-and-edges
---

Read from the code on 2026-10-12 (`compiler/src`, `compiler/adapters`). Hosts: `claude-code` (CC), `codex` (CX), `kilo` (KL), `opencode` (OC), `cursor` (CU), `gemini-cli` (GM), `copilot` (CP). `HOSTS` is `compiler/src/capabilities.mjs:6`; a capability row is `compiler/capabilities/<host>.json`, validated by `compiler/schemas/capabilities.schema.json`.

| # | What differs | Where | Hosts |
|---|---|---|---|
| 1 | Capability row (hooks, permissions, agents, instructions, routing, telemetry, tiers) | `compiler/capabilities/*.json`, loaded in `capabilities.mjs:15` | all; data, no branch |
| 2 | Hook config file written | `apply.mjs:244` (CC `.claude/settings.json`), `:253` (CX `.codex/hooks.json`), `:262` (GM `.gemini/settings.json`), `:271` (CU `.cursor/hooks.json`, `version: 1`), `:278` (CP hooks file), `:286` (KL, OC plugin `caps.hooks.config`) | all |
| 3 | Hook event names and entry shape (`PreToolUse`/`PostToolUse`, `AfterTool`, `postToolUse`, `ccLike` vs `plain`) | `apply.mjs:240-300` | CC CX GM CU CP |
| 4 | Plugin source embedded in the output (spawns the runner, maps `tool.execute.before/after`) | `apply.mjs:300-325` | KL OC |
| 5 | Files shared by hosts, so ownership and removal must check the others | `apply.mjs:192` (`SHARED_HOOK_FILES`), `:387-392` | CC CX GM CU |
| 6 | Instruction file name and the files that point at it | `apply.mjs:457-460` (`CLAUDE.md` symlink to `AGENTS.md`), `:462-472` (`context.fileName` in `.gemini/settings.json`); `detect.mjs:200` | CC, GM |
| 7 | Skills directory | `apply.mjs:379` (`.claude/<dir>` symlink to `.agents/<dir>`), `:545` (skills on by default for KL OC) | CC, KL, OC |
| 8 | Agent file format and read-only tool names | `agents.mjs:15-17` (tool lists), `:58-64` (`RENDER` per host), `:87-101` (dir and extension from the row) | all |
| 9 | Permission ask rules, two formats | `gate.mjs:238-245` and `:368-374` (`claude-permissions`, `opencode-permission`), `apply.mjs:511` | CC, KL, OC |
| 10 | Hook payload field names, tool names and tool classes | `hook.mjs:27` (`METADATA`), `:45-62` (`TOOLS`), `:64-71` (`toolName`, `toolInput`, Copilot `toolArgs` as JSON text), `:468` (response field aliases), `secrets/mask.mjs:17` (session id aliases) | all |
| 11 | Hook answer shape (block, replace output, ask) | `hook.mjs:518-525` (`respondPostTool`: CC, CP, CX, GM, KL), `:531` (`respond`: ask on CC), `:535` (CP JSON deny); `verify.mjs:183` (CU `followup_message`) | CC CX GM KL CP CU |
| 12 | Detection of a host in a project | `detect.mjs:191-197` | all |
| 13 | Prompt-log off, cache TTL, spend flag, OpenTelemetry target | `apply.mjs:481` (row `telemetry.promptLogOff`), `:498` (row `routing.cacheTtl`), `commands/route.mjs:15` (`SPEND_FLAG`: CC, CP), `telemetry/otel.mjs:9-26` (GM file target; CC CX KL OC CU CP carry a reason) | per host |

Outside the compiler's runtime path, a host also appears in:

- `compiler/src/build.mjs:8-19` (`ADAPTERS` imports `compiler/adapters/<host>.mjs`, 64 lines in all): the build-time plugin output per host (`PLUGIN_DIR`, skills, `skills/index.json`). This is the one existing adapter-shaped module.
- `compiler/src/build.mjs:26-28` and `checks/versions.mjs:8-11`: plugin manifests (`.claude-plugin`, `.codex-plugin`, `gemini-extension.json`) and their version check.
- `compiler/src/checks/neutral.mjs:6-15`: host names and paths neutral source must not contain.
- `compiler/src/coverage.mjs:36`: reads `caps[h].tiers`; no branch.

What the first three hosts need from an adapter, from the rows above: CC (2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13), KL and OC (2 through the plugin source in 4, 7, 8, 9, 10, 11 for KL, 12, 13). CX, CU, GM and CP keep every row on today's code.
