---
id: 0005-kilo-opencode-integration-surface
title: Kilo Code CLI and OpenCode harness extension points
status: active
date: 2026-10-04
tags: [kilo, opencode, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

Kilo Code CLI is a fork of OpenCode. Both use the same configuration model; Kilo renames files: `kilo.json[c]` / `.kilo/` (project), `~/.config/kilo/` (global), and no longer reads `.opencode/` directories. Below, `.opencode/` paths apply to OpenCode; Kilo uses `.kilo/`.

## Instruction files
`AGENTS.md` found walking up from cwd, then `~/.config/opencode/AGENTS.md`; falls back to `CLAUDE.md` and `~/.claude/CLAUDE.md` (first match per category wins). Extra files or URLs via config `instructions: [...]`.

## Skills, agents, commands
- **Skills**: Agent Skills format (`name`, `description` required; `license`, `compatibility`, `metadata` optional; other keys ignored; name `^[a-z0-9]+(-[a-z0-9]+)*$`). Scanned from `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` (walking up to the git worktree root) and their global equivalents. Loaded on demand through the `skill` tool. Kilo also accepts remote sources via `skills.urls` serving `index.json`.
- **Agents**: config `agent` key or Markdown files in `.opencode/agents/` / `~/.config/opencode/agents/` (filename = name). Frontmatter: `description` (required), `mode` (`primary | subagent | all`), `model`, `temperature`, `permission`, `prompt`, `steps`. Subagents inherit the caller's model unless overridden; invoked automatically, by `@name`, or via the `task` tool.
- **Commands**: `.opencode/commands/*.md` (frontmatter `description`, `agent`, `model`, `subtask`); body supports `$ARGUMENTS`, `$1..`, `` !`cmd` ``, `@file`.

## Packaging and install
No marketplace manifest. Distribution means: config `plugin` (npm packages), local `.opencode/plugins/`, remote config at `.well-known/opencode`, `OPENCODE_CONFIG_CONTENT` / Kilo `KILO_CONFIG_CONTENT`, managed config dirs (`/etc/opencode/`, etc.). Kilo: `npm install -g @kilocode/cli`; `kilo plugin <module>`.

## Headless invocation
`opencode run` / `kilo run [message]`, `--auto` (Kilo: non-approved operations are denied instead of prompting), `-m <provider>/<model>`.

## Hooks and permissions
- **Plugins as hooks**: JS/TS modules run under Bun; events include `tool.execute.before`, `tool.execute.after`, `permission.asked`, `session.*` (`created`, `compacted`, `idle`, `error`...), `file.edited`, `shell.env`, `experimental.session.compacting`. Throwing blocks the operation; hooks can modify `input`/`output`. No token or cost data documented for plugins.
- **Permissions**: `permission` map with `allow | ask | deny` per tool (`read`, `edit`, `glob`, `grep`, `bash`, `task`, `skill`, `webfetch`, `websearch`, `external_directory`, `doom_loop`...), wildcard patterns on paths and commands (e.g. `"edit": {"*.env": "deny"}`), per-agent overrides that win over global.

## Model selection and effort
Global `model`, `small_model`; per agent and per command `model`; `/models` in session. Variants: Anthropic thinking budgets (`high`, `max`), OpenAI `reasoningEffort` (`none … xhigh`), custom variants in config.

## Local or custom endpoints
75+ providers via AI SDK / Models.dev; `provider.<id>.options.baseURL` for OpenAI-compatible endpoints (Ollama, LM Studio). Kilo: project-scope config rejects `{env:VAR}` credential interpolation (observed in an earlier test, not re-verified here); pass secrets via `KILO_CONFIG_CONTENT`.

## Prompt caching
Not documented by OpenCode or Kilo; depends on the provider.

## Telemetry and cost
No OpenTelemetry export or cost metric documented.

## DLP levers
`permission.read` / `permission.edit` path denies (incl. per agent), `tool.execute.before` throwing on restricted paths, `external_directory` deny.

## Native harness components
1 loop, 2 tools/MCP, 3 not documented, 4 compaction (`session.compacted`), 5 AGENTS.md, 6 plugins enable verification, 7 permissions + plugins (`doom_loop` guard), 8 `ask` permissions, 9 `session.diff` only, 10 subagents via `task`, 11 per-agent/command model and variants (no spend cap), 12 not documented.

## Node availability
OpenCode plugins run under Bun. Kilo installs from npm (`@kilocode/cli`), so Node is present where Kilo is installed that way.

## Not confirmed
- OpenCode's own install methods and whether Node is needed at runtime.
- Kilo's exact agent and command directory names under `.kilo/` (assumed to mirror `.opencode/`); its plugin directory is `.kilo/plugin/` (fact 0031).
- Ownership/vendor claims in the fetched Kilo CLI summary were contradictory and are excluded.
- Prompt-cache behavior, telemetry and spend caps.

## Sources (accessed 2026-10-04)
https://opencode.ai/docs/agents/ · https://opencode.ai/docs/permissions/ · https://opencode.ai/docs/plugins/ · https://opencode.ai/docs/config/ · https://opencode.ai/docs/commands/ · https://opencode.ai/docs/rules/ · https://opencode.ai/docs/skills/ · https://opencode.ai/docs/models/ · https://kilo.ai/docs/cli
