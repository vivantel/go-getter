---
id: 0003-claude-code-integration-surface
title: Claude Code's harness extension points
status: active
date: 2026-10-04
tags: [claude-code, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

Claude Code (docs reflect versions up to ~v2.1.288).

## Instruction files
`CLAUDE.md` (project root, `~/.claude/`, nested subdirs loaded on first file read there), plus `.claude/rules` with `paths:` frontmatter. Read once at session start; mid-session edits apply only after `/clear`, `/compact` or restart.

## Skills, agents, commands
- **Skills**: `.claude/skills/<name>/SKILL.md` (project), `~/.claude/skills/` (user), `<plugin>/skills/`. Follows the open Agent Skills standard (agentskills.io: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) plus extensions incl. `model`, `effort`, `context: fork`, `agent`, `hooks`, `paths`, `disable-model-invocation`. Only name+description stay in context until invoked; description+`when_to_use` truncated at 1,536 chars.
- **Commands**: `.claude/commands/*.md` still work but are merged into skills.
- **Subagents**: Markdown+frontmatter in `.claude/agents/`, `~/.claude/agents/`, `<plugin>/agents/`, or `--agents` JSON. Fields incl. `tools`, `disallowedTools`, `model` (`sonnet|opus|haiku|fable|inherit|<full id>`), `effort` (`low..max`), `permissionMode`, `maxTurns`, `isolation: worktree`, `hooks`, `skills`, `mcpServers`, `experimental.cacheTtl`. `permissionMode`, `hooks`, `mcpServers` are ignored for plugin-shipped agents. Separate context (no parent history); a fork inherits full context. Nesting ≤3, ≤20 concurrent by default.

## Packaging and install
Plugin = `.claude-plugin/plugin.json` (optional; only `name` required) + default dirs `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `monitors/`, `bin/`, `settings.json`. Plugin `settings` honor only `agent` and `subagentStatusLine` — a plugin cannot ship permissions, env or model settings. Distributed via git marketplaces (`.claude-plugin/marketplace.json`); `claude plugin validate [--strict]`. Hooks get `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`.

## Headless invocation
`claude -p` with `--output-format json|stream-json` (result has `total_cost_usd`, per-model cost, `usage` incl. cache tokens), `--bare`, `--model`, `--effort`, `--max-turns`, `--max-budget-usd` (print mode; subagent spend counts), `--agents`, `--settings`, `--permission-mode`, `--permission-prompts none`, `--plugin-dir`.

## Hooks and permissions
- **Hooks**: configured in `~/.claude/settings.json`, `.claude/settings.json` (committable), `.claude/settings.local.json`, managed settings, plugin `hooks/hooks.json`, skill/agent frontmatter. Types: `command`, `http`, `mcp_tool`, `prompt`, `agent`. Events incl. `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart/Stop`, `PreCompact`, `PreModelSwitch`, `WorktreeCreate/Remove`, `ConfigChange`. Blocking via exit 2 or JSON (`permissionDecision: "deny"`, `decision: "block"`). `PreToolUse` can rewrite input (`updatedInput`); `PostToolUse` can rewrite output (`updatedToolOutput`). Hook input has no token or cost fields.
- **Permissions**: `permissions.allow|ask|deny` in settings; path rules `Read(...)`/`Edit(...)` with gitignore syntax (e.g. `Read(./.env)`, `Read(./secrets/**)`). Deny beats allow. Read/Edit denies cover file tools and recognized Bash file commands, not arbitrary subprocesses; OS-level blocking needs the sandbox.
- **Sandbox**: OS-enforced (Seatbelt on macOS, bubblewrap on Linux/WSL2; none on native Windows) for Bash/PowerShell/Monitor and child processes: `sandbox.enabled`, `sandbox.filesystem.denyRead|denyWrite|allowRead|allowWrite`, network allowlist. File tools, MCP servers and hooks run outside it.

## Model selection and effort
Session: `/model`, `--model`, `ANTHROPIC_MODEL`, settings `model`. Per subagent: frontmatter `model` (resolution: per-invocation param → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → session); the Agent tool's per-invocation `model` takes only `sonnet|opus|haiku|fable` (observed 2026-10-05). Per skill: `model`/`effort` frontmatter (a model differing from the session's is a cache-cold switch for that turn). Effort: `low|medium|high|xhigh|max` via `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, `effortLevel`, `modelSettings.<model>.effortLevel`. Also `fallbackModel` chain, `opusplan`, admin `availableModels`/`deniedModels`.

## Local or custom endpoints
`ANTHROPIC_BASE_URL` (LLM gateway), Bedrock / Google Agent Platform / Foundry, `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU,FABLE}_MODEL` pins, `ANTHROPIC_CUSTOM_MODEL_OPTION`. Endpoint must speak the Anthropic Messages API.

## Prompt caching
Automatic prefix caching (system prompt → project context → conversation). Invalidated by: switching model, changing effort (except Opus/Sonnet 5.5 and Fable 5.1 via API key/subscription), fast mode on, MCP/tool-set changes (unless tool search defers), compaction. Kept by: file edits, skill invocation, permission-mode changes, subagent spawn (subagent builds its own cache; a fork reads the parent's). TTL: `promptCacheTtl` / `subagentPromptCacheTtl` (`5m|1h`); main conversation defaults to 1h on subscription within plan, else 5m; subagents 5m. Cache tokens are visible in statusline `current_usage` (`cache_creation_input_tokens`, `cache_read_input_tokens`), `/usage`, `-p` JSON and OTel.

## Telemetry and cost
OpenTelemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_*` exporters. Metrics `claude_code.token.usage` (`type`: input/output/cacheRead/cacheCreation), `claude_code.cost.usage` (USD); event `claude_code.api_request` carries `model`, `cost_usd`, cache token counts. Prompt content is redacted unless `OTEL_LOG_USER_PROMPTS=1`. Spend caps: `--max-budget-usd` (print mode only); interactive caps only via the Claude apps gateway.

## DLP levers
`Read`/`Edit` deny rules, sandbox `denyRead`, `PreToolUse` deny/rewrite, `PostToolUse` output rewrite (redaction), admin `availableModels`/`deniedModels`, ZDR available per org.

## Native harness components
1 loop, 2 tools/MCP, 3 sandbox (Bash only), 4 context (compaction, tool search, skills), 5 memory (CLAUDE.md, auto memory, agent `memory`), 6 hooks enable verification, 7 permissions/sandbox/auto-mode classifier, 8 permission prompts, 9 checkpointing (`/rewind`; file-tool edits only, not Bash or background-subagent edits), 10 subagents/agent teams/worktrees, 11 model/effort/fallback + `--max-budget-usd`, 12 OTel.

## Node availability
Not guaranteed: the native installer, Homebrew, WinGet and apt/dnf/apk ship a native binary; npm install (Node ≥22) also runs a native binary. Node is not required to run Claude Code.

## Not confirmed
- Whether plugin-shipped hooks can enforce permissions equivalent to settings `permissions.deny` (plugins cannot ship `permissions`).
- Interactive-session spend cap without a gateway.

## Sources (accessed 2026-10-04)
https://code.claude.com/docs/en/sub-agents.md · https://code.claude.com/docs/en/hooks.md · https://code.claude.com/docs/en/model-config.md · https://code.claude.com/docs/en/prompt-caching.md · https://code.claude.com/docs/en/monitoring-usage.md · https://code.claude.com/docs/en/permissions.md · https://code.claude.com/docs/en/skills.md · https://code.claude.com/docs/en/plugins/manifest-reference.md · https://code.claude.com/docs/en/setup.md · https://code.claude.com/docs/en/headless.md · https://code.claude.com/docs/en/cli-reference.md · https://code.claude.com/docs/en/checkpointing.md · https://code.claude.com/docs/en/sandboxing.md
