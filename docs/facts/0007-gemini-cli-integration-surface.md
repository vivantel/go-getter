---
id: 0007-gemini-cli-integration-surface
title: Gemini CLI's harness extension points
status: active
date: 2026-10-04
tags: [gemini-cli, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

Gemini CLI (open source, Google).

## Instruction files
`GEMINI.md`: global `~/.gemini/GEMINI.md`, workspace dirs and parents, and just-in-time when a tool touches a directory. File names configurable: `context.fileName` (e.g. `["AGENTS.md", "GEMINI.md"]`). Imports via `@./path.md`. `/memory show|reload`.

## Skills, agents, commands
- **Skills**: built-in → extension → user (`~/.gemini/skills/`, alias `~/.agents/skills/`) → workspace (`.gemini/skills/`, alias `.agents/skills/`; alias wins within a tier). Activated by the `activate_skill` tool with a user confirmation prompt.
- **Subagents**: Markdown in `.gemini/agents/*.md` or `~/.gemini/agents/*.md`. Frontmatter: `name`, `description` (required); `kind` (`local | remote`), `tools` (wildcards `*`, `mcp_*`), `mcpServers`, `model` (default inherit), `temperature`, `max_turns` (30), `timeout_mins` (10). Isolated context; subagents cannot call other subagents. Enabled by default (`enableAgents`).
- **Commands**: TOML in `.gemini/commands/` / `~/.gemini/commands/` (subdirs → `/ns:cmd`); `prompt` (required), `description`; `{{args}}`, `!{shell}`, `@{file}`.

## Packaging and install
Extensions bundle prompts/context, MCP servers, custom commands, themes, hooks, subagents and skills; manifest `gemini-extension.json` (field list not on the fetched page). `gemini extensions install <github-url>`, `gemini extensions list`; public gallery.

## Headless invocation
Headless mode documented (`/docs/cli/headless`); flags not captured here.

## Hooks and permissions
- **Hooks**: `hooks` key in `.gemini/settings.json`, `~/.gemini/settings.json`, `/etc/gemini-cli/settings.json`, or extensions. Events: `SessionStart`, `SessionEnd`, `BeforeAgent`, `AfterAgent`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `BeforeTool`, `AfterTool`, `PreCompress`, `Notification`. Exit 2 or `"decision": "deny"` blocks `BeforeAgent`, `AfterAgent`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `BeforeTool`, `AfterTool`. `BeforeModel` can modify prompts, **swap models**, or mock responses. Stdout must be only the final JSON.
- **Policy engine**: TOML `[[rule]]` with `toolName`, `decision` (`allow | deny | ask_user`), `priority`, `argsPattern` (regex over JSON args), `commandPrefix`/`commandRegex`, `modes`, `interactive`. Tiers: default 1, extension 2, workspace 3 (workspace policies currently disabled), user 4 (`~/.gemini/policies/`), admin 5.
- Also `.geminiignore`, trusted folders, sandboxing (`/docs/cli/sandbox`).
- **Session identity** (accessed 2026-10-10, https://geminicli.com/docs/hooks/reference): every hook receives `session_id` (also `transcript_path`, `cwd`, `hook_event_name`, `timestamp`), and the environment variable `GEMINI_SESSION_ID` is passed to hooks. `SessionEnd` exists and takes `reason` (`exit`, `clear`, `logout`, `prompt_input_exit`, `other`).

## Model selection and effort
`--model` → `GEMINI_MODEL` → `model.name` → default `auto`. Model routing = failure fallback (quota/server errors), not complexity routing; optional local Gemma model for routing decisions (`gemini gemma setup`). Per subagent `model`. No effort setting documented.

## Local or custom endpoints
Gemini API key, Vertex AI, or OAuth (Code Assist). Local Gemma only for routing decisions; no OpenAI-compatible/local inference endpoint documented.

## Prompt caching
Automatic for Gemini API key and Vertex AI users; unavailable for OAuth users. Savings shown in `/stats`.

## Telemetry and cost
`telemetry.enabled` (default false), `target` (`local | gcp`), `otlpEndpoint`, env overrides (`GEMINI_TELEMETRY_ENABLED`). Metrics `gemini_cli.token.usage` (input, output, thought, cache, tool; `model` attribute), `gen_ai.client.token.usage`; log `gemini_cli.api.response` with `cached_content_token_count`. **`logPrompts` defaults to true** — prompts are exported unless disabled. No cost metric documented.

## DLP levers
`BeforeTool` deny, `BeforeModel` deny/modify, policy `deny` with `argsPattern`, `.geminiignore`, sandbox. No path-based read rule in the policy engine itself (needs `argsPattern` or hooks).

## Native harness components
1 loop, 2 tools/MCP, 3 sandbox, 4 compression (`PreCompress`), 5 GEMINI.md/`/memory`, 6 hooks (`AfterAgent` block enables verify loops), 7 policy engine/hooks/trusted folders, 8 `ask_user`, 9 checkpointing (`general.checkpointing.enabled`; shadow git repo before file-modifying tools; `/restore`) and rewind, 10 subagents (one level), 11 model fallback + `BeforeModel` model swap (no spend cap), 12 OTel.

## Node availability
Requires Node.js ≥ 20 at runtime (npm, Homebrew, MacPorts, conda, npx installs).

## Not confirmed
- `gemini-extension.json` field list and whether extensions can ship policies or settings.
- SKILL.md frontmatter beyond the Agent Skills basics.
- Headless flags and JSON usage fields.
- Cost reporting or spend cap.

## Sources (accessed 2026-10-04)
https://geminicli.com/docs/core/subagents · https://geminicli.com/docs/hooks · https://geminicli.com/docs/extensions · https://geminicli.com/docs/reference/policy-engine · https://geminicli.com/docs/cli/model-routing · https://geminicli.com/docs/cli/telemetry · https://geminicli.com/docs/get-started/installation · https://geminicli.com/docs/cli/token-caching · https://geminicli.com/docs/cli/skills · https://geminicli.com/docs/cli/custom-commands · https://geminicli.com/docs/cli/gemini-md · https://geminicli.com/docs/cli/checkpointing
