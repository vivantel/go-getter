---
id: 0008-copilot-integration-surface
title: GitHub Copilot's harness extension points
status: active
date: 2026-10-04
tags: [copilot, host-agents, harness]
kind: environmental
governed-by: 0002-six-host-agents-from-v0-1
---

GitHub Copilot: cloud agent (coding agent on GitHub), Copilot CLI, IDE agent mode (VS Code etc.), code review.

## Instruction files
`.github/copilot-instructions.md` (repo-wide), `.github/instructions/**/NAME.instructions.md` (path-specific), `AGENTS.md` anywhere (nearest wins) or a single root `CLAUDE.md` / `GEMINI.md`. Cloud agent and code review read all three kinds.

## Skills, agents, commands
- **Skills**: project `.github/skills/`, `.claude/skills/`, `.agents/skills/`; personal `~/.copilot/skills/`, `~/.agents/skills/`. Frontmatter `name`, `description` (required), `license`. Work in cloud agent, code review, CLI, Copilot app and VS Code agent mode.
- **Custom agents**: `*.agent.md` in `.github/agents/` (repo), `~/.copilot/agents/` (CLI user), org/enterprise `.github-private` repo. Frontmatter: `description` (required), `name`, `target` (`vscode | github-copilot`), `tools`, `model` (inherits if unset), `disable-model-invocation`, `user-invocable`, `mcp-servers` and `metadata` (not used in IDEs), CLI `include-custom-instructions`. Body ≤30,000 chars. Invoked via `/agent`, `--agent`, by name, or inferred.

## Packaging and install
Copilot CLI plugins: root `plugin.json` in Agent Plugins 1.0 format (`$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`; top-level fields limited to `$schema, name, version, description, author, homepage, repository, license, keywords, extensions`; Copilot-specific parts under `com.github.copilot`) or a legacy format with `agents`, `skills`, `hooks`, `mcpServers`. Bundles agents, skills, hooks (`hooks.json`), MCP (`mcp.json`). `copilot plugin install <path>`; plugin marketplaces supported (separate doc).

## Headless invocation
`copilot --agent <id> --prompt "..."`, `--allow-tool` / `--deny-tool`, `--output-format text|json` (JSONL), `--max-ai-credits N` (spend cap in autopilot mode).

## Hooks and permissions
- **Hooks**: `.github/hooks/*.json` (repo) and `~/.copilot/hooks/*.json` (CLI); schema `version: 1`, `hooks` with `type: "command"`, `bash` / `powershell`, optional `cwd`, `env`, `timeoutSec` (30). Events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `agentStop`, `subagentStop`, `errorOccurred`. Only `preToolUse` can approve/deny. Supported by cloud agent and CLI; IDE support not stated.
- **Tool permissions**: CLI `--allow-tool` / `--deny-tool`; per-agent `tools`.
- **Cloud agent firewall**: outbound internet limited by default, with allowlist; org setting Enabled / Disabled / Let repositories decide.
- **Content exclusion** (Business/Enterprise): path exclusions configured at repo/org/enterprise.

## Model selection and effort
Per custom agent `model`; otherwise the default model. Effort control not documented.

## Local or custom endpoints
Not documented for the agents (BYOK not confirmed).

## Prompt caching
Not exposed.

## Telemetry and cost
`--max-ai-credits` cap (autopilot); usage/premium-request reporting not documented on the fetched pages; no OTel export documented.

## DLP levers
`preToolUse` deny, content exclusion, cloud agent firewall, `--deny-tool`.

## Native harness components
1 loop, 2 tools/MCP, 3 cloud agent runs in GitHub Actions with firewall, 4 not documented, 5 instruction files, 6 hooks (`agentStop`), 7 hooks/firewall/content exclusion, 8 PR review of cloud agent output, 9 git history (cloud agent works in PRs), 10 custom agents/subagents, 11 per-agent model + `--max-ai-credits`, 12 not documented.

## Node availability
CLI: npm install needs Node ≥22; also Homebrew cask, WinGet, install script, direct download. Runtime Node need for non-npm installs not stated.

## Not confirmed
- Content exclusion vs CLI/agent mode: one page says CLI and IDE agent mode do **not** support it, another says the CLI respects it. Treat as unenforced until verified.
- Hook input fields and whether hooks can modify arguments.
- Whether IDE agent mode runs `.github/hooks`.
- Effort control, BYOK/custom endpoints, usage reporting.

## Sources (accessed 2026-10-04)
https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli · https://docs.github.com/en/copilot/reference/custom-agents-configuration · https://docs.github.com/en/copilot/concepts/agents/hooks · https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating · https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference · https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills · https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli · https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions · https://docs.github.com/en/copilot/concepts/context/content-exclusion · https://docs.github.com/en/copilot/customizing-copilot/customizing-or-disabling-the-firewall-for-copilot-coding-agent
