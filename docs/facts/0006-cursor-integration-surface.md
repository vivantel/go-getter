---
id: 0006-cursor-integration-surface
title: Cursor's harness extension points
status: active
date: 2026-10-04
tags: [cursor, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

Cursor (IDE agent, `agent` CLI, cloud agents).

## Instruction files
Project rules: `.cursor/rules/*.mdc` (plain `.md` ignored) with frontmatter `description`, `globs`, `alwaysApply` → always / intelligent (by description) / file-pattern / manual (`@rule`). `AGENTS.md` at root and in any subdirectory (applies to that subtree). User Rules (local) and Team Rules (dashboard; take precedence). No documented `CLAUDE.md` support.

## Skills, agents, commands
- **Skills**: `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`; also reads `.claude/skills/`, `.codex/skills/` and user equivalents. Frontmatter: `name` (must match folder), `description`; optional `paths`, `disable-model-invocation`, `icon`, `color`, `metadata`. Invoked with `/name` or automatically.
- **Subagents**: Markdown in `.cursor/agents/` (also reads `.claude/agents/`, `.codex/agents/`; user `~/...` equivalents; `.cursor/` wins on name clash). Frontmatter: `name`, `description`, `model` (`inherit` or id, with params e.g. `claude-opus-5[effort=high,context=300k]`), `readonly`, `is_background`. Parallel via multiple Task calls; one nesting level only.
- **Commands**: legacy slash commands were migrated to skills with `disable-model-invocation: true`.

## Packaging and install
Plugins: `.cursor-plugin/plugin.json`, or a root `plugin.json` using the Agent Plugins schema (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`). Bundle rules, skills, agents, commands, MCP servers, hooks. Installed from the Customize sidebar at project or user scope; team marketplaces (Teams: 1, Enterprise: unlimited) with admin modes Default Off / Default On / Required. MCP deeplinks `cursor://anysphere.cursor-deeplink/mcp/install?...`.

## Headless invocation
CLI binary `agent`: `-p/--print`, `--output-format text|json|stream-json`, `--model`, `-f/--force`, `--sandbox enabled|disabled`. Usage/cost in JSON output not documented.

## Hooks and permissions
- **Hooks**: `hooks.json` at `.cursor/hooks.json`, `~/.cursor/hooks.json`, enterprise system paths, team. Agent events: `sessionStart/End`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart/Stop`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `afterAgentResponse`, `afterAgentThought`; plus Tab and `workspaceOpen`. Permission responses `allow | deny | ask`; exit 2 = deny; other non-zero exits fail open; invalid JSON blocks. `preToolUse` can rewrite input (`updated_input`); `postToolUse` can rewrite MCP output only. Input includes `model`, `model_id`, `model_params`, `user_email`, `transcript_path`; no token/cost fields documented. Cloud agents lack session, MCP and Tab hooks.
- **CLI permissions**: `~/.cursor/cli-config.json`, `<project>/.cursor/cli.json`: `permissions.allow|deny` with `Shell(...)`, `Read(glob)`, `Write(glob)`, `WebFetch(...)`, `Mcp(server:tool)`; deny wins.
- **`.cursorignore`**: blocks the agent's file access; terminal commands and MCP tools can still read ignored files.
- **Session identity** (accessed 2026-10-10, https://cursor.com/docs/hooks): the fields common to every hook are `conversation_id` and `generation_id`, with no `session_id`; `session_id` appears only in `sessionStart` and `sessionEnd`, and the `sessionStart` table says it matches `conversation_id`. `postToolUse` carries `conversation_id` through the common fields. `sessionEnd` exists (`reason`, `duration_ms`, `final_status`) and is tied to the IDE session. **Not confirmed**: that `session_id` always equals `conversation_id`, and whether `sessionEnd` fires in the CLI.

## Model selection and effort
Per subagent `model` with bracket parameters (effort, context). Auto mode: Cursor Router picks a model per request by Cost / Balance / Intelligence (Teams/Enterprise). Max Mode extends context at API rate +20% (legacy plans).

## Local or custom endpoints
Not documented on the fetched pages (BYOK / base-URL override unconfirmed).

## Prompt caching
Billed separately: Cursor models list cache-write and cache-read prices; third-party models bill at their API rates (+$0.25/M Cursor Token Rate on Teams/Enterprise). Cache controls not exposed.

## Telemetry and cost
No OTel export documented; usage visible in the dashboard. No hard spend cap documented (on-demand usage continues at API rates).

## DLP levers
`beforeReadFile` deny, `beforeShellExecution` / `beforeMCPExecution` / `preToolUse` deny, CLI `Read(...)` deny, `.cursorignore`, `--sandbox`.

## Native harness components
1 loop, 2 tools/MCP, 3 CLI sandbox, 4 compaction (`preCompact`), 5 rules/AGENTS.md, 6 hooks (`stop` follow-up enables verify loops), 7 hooks/permissions/ignore, 8 `ask`, 9 not documented, 10 subagents + cloud agents, 11 Auto/Cursor Router (no spend cap), 12 dashboard only.

## Node availability
CLI installs via native script (macOS, Linux, WSL, Windows); Node not required.

## Not confirmed
- Whether CLI `permissions` apply to the IDE agent.
- BYOK and custom/local endpoints.
- Token/cost fields in CLI JSON output.
- Checkpoint/restore controls.

## Sources (accessed 2026-10-04)
https://cursor.com/docs/rules · https://cursor.com/docs/subagents · https://cursor.com/docs/hooks · https://cursor.com/docs/plugins · https://cursor.com/docs/skills · https://cursor.com/docs/cli/reference/permissions · https://cursor.com/docs/cli/reference/parameters · https://cursor.com/docs/cli/installation · https://cursor.com/docs/models-and-pricing · https://cursor.com/help/customization/ignore-files
