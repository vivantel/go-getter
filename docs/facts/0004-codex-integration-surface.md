---
id: 0004-codex-integration-surface
title: Codex's harness extension points
status: active
date: 2026-10-04
tags: [codex, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

OpenAI Codex (CLI, IDE extension, cloud). Docs moved from developers.openai.com/codex to learn.chatgpt.com/docs.

## Instruction files
`AGENTS.md` (project hierarchy). Config: `project_doc_max_bytes`, `project_doc_fallback_filenames`, `model_instructions_file`, `project_root_markers`.

## Skills, agents, commands
- **Skills**: `SKILL.md` with required `name`, `description`; optional `agents/openai.yaml` (UI metadata, invocation policy, tool dependencies). Scanned from `$CWD/.agents/skills`, `$REPO_ROOT/.agents/skills`, `$HOME/.agents/skills`, `/etc/codex/skills`, bundled. Name+description listed up front (≤2% of context or 8,000 chars); body loads on use. Explicit invocation `$skill`.
- **Custom agents**: one TOML file each in `.codex/agents/` (project) or `~/.codex/agents/`; required `name`, `description`, `developer_instructions`; optional `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`; may override any `config.toml` key. Also `agents.<name>.description` / `agents.<name>.config_file` in config. Global `[agents]`: `enabled`, `max_concurrent_threads_per_session`, `default_subagent_model`, `default_subagent_reasoning_effort`. Resolution: explicit spawn value → `[agents]` defaults → parent.
- **Commands**: no documented custom slash-command format beyond skills.

## Packaging and install
Plugin = root `plugin.json` (portable, preferred; OpenAI-specific settings under `extensions.com.openai`) or legacy `.codex-plugin/plugin.json`; bundles `skills/`, `mcp.json`, `.app.json`, `hooks/hooks.json`, `assets/`. Agents are not a documented plugin component. Marketplaces: `$REPO_ROOT/.agents/plugins/marketplace.json` or `~/.agents/plugins/marketplace.json`; `codex plugin marketplace add owner/repo`.

## Headless invocation
`codex exec` with `--json` (JSONL events incl. `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`), `--output-schema`, `--sandbox`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `resume`. No cost field, budget cap or turn limit documented.

## Hooks and permissions
- **Hooks**: `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`, inline `[hooks]` in `config.toml`, plugin manifests, managed `requirements.toml`; gated by `features.hooks`. Events: `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `Stop`, `Interrupt`. Blocking: `PreToolUse` deny / exit 2; `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop` block. `PreToolUse` may rewrite input (`updatedInput`); `PostToolUse` can only replace the result with feedback. Input includes `model` and `permission_mode`. Covers shell (`Bash`), `apply_patch` edits, MCP and local function tools; not hosted tools such as web search.
- **Rules** (experimental): Starlark `prefix_rule()` files in `~/.codex/rules/`, `<repo>/.codex/rules/` → `allow | prompt | forbidden` for shell commands; most restrictive wins.
- **Sandbox/approvals**: `sandbox_mode` = `read-only | workspace-write | danger-full-access`; `sandbox_workspace_write.writable_roots`, `.network_access`; `approval_policy` (`on-request | never | granular`), `approvals_reviewer` (`user | auto_review`). OS enforcement: Seatbelt (macOS), bubblewrap (Linux/WSL2), native Windows sandbox.

## Model selection and effort
`model`, `model_reasoning_effort` (`low … xhigh, max, ultra`, model-dependent) in `config.toml`, per custom agent, profiles (`--profile`), `-c` overrides. Per-agent model and effort supported.

## Local or custom endpoints
`model_providers.<id>` (`name`, `base_url`, `env_key`), `model_provider`, `oss_provider` + `--oss` for local models. Provider keys are user-level only (ignored in project config).

## Prompt caching
Server-side automatic caching; `cached_input_tokens` reported in `exec --json`. No documented cache TTL or invalidation controls.

## Telemetry and cost
`[otel]` (`exporter = none | otlp-http | otlp-grpc`, `environment`, `log_user_prompt` opt-in) — user-level config only. Token counts available; no cost metric documented.

## DLP levers
`PreToolUse` deny/rewrite on shell, edits and MCP tools; rules `forbidden`; sandbox write roots and network off. No documented per-path read deny.

## Native harness components
1 loop, 2 tools/MCP, 3 sandbox (OS-level, all commands), 4 context (compaction, progressive skills), 5 memory (AGENTS.md), 6 hooks enable verification, 7 approvals/rules/auto-review, 8 approvals, 9 not documented, 10 subagents, 11 model/effort per agent (no spend cap), 12 OTel.

## Node availability
Native installers (macOS/Linux/Windows) and Homebrew exist alongside `npm i -g @openai/codex`; Node is not required by the native installs.

## Not confirmed
- Checkpoint/rollback support.
- Whether project-scoped hooks need a trusted project, as project config does.
- Whether a plugin can ship custom agents or config.
- Cost reporting and any spend cap.

## Sources (accessed 2026-10-04)
https://learn.chatgpt.com/docs/agent-configuration/subagents.md · https://learn.chatgpt.com/docs/hooks.md · https://learn.chatgpt.com/docs/config-file/config-reference.md · https://learn.chatgpt.com/docs/build-skills.md · https://developers.openai.com/plugins/build/plugins · https://learn.chatgpt.com/docs/codex/cli.md · https://learn.chatgpt.com/docs/non-interactive-mode.md · https://learn.chatgpt.com/docs/sandboxing.md · https://learn.chatgpt.com/docs/agent-configuration/rules.md
