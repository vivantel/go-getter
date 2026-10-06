---
id: 0031-host-output-redaction-and-read-deny-levers
title: Copilot, Codex, Gemini CLI and Kilo hooks can replace a tool result; Cursor only an MCP result; reads are denied by config on Cursor, OpenCode and Kilo and by hooks everywhere
status: active
date: 2026-10-06
tags: [host-agents, governance, security, hooks]
kind: environmental
governed-by: 0072-restricted-paths-have-access-modes
expires: 2027-01-04
---

Claude Code is in fact 0027. "Hook deny" is the pre-tool block every host has (facts 0004-0008).

| Host | Replace tool output | Deny reads | Credential mask |
|---|---|---|---|
| Codex | `PostToolUse` `{"decision":"block","reason":…}`: the result is replaced by the reason; fires for `Bash`, `apply_patch`, MCP and other local tools; input `tool_response` | Hook deny; permission profiles `[permissions.<name>.filesystem]` `"<glob>" = "deny"` for sandboxed commands only | `shell_environment_policy`: with `ignore_default_excludes = false`, variables named with KEY, SECRET or TOKEN are dropped (removal, not mask) |
| Cursor | `postToolUse` `updated_mcp_tool_output`, MCP tools only | Hook deny; `beforeReadFile` `{"permission":"deny"}`; CLI permissions (`.cursor/cli.json`) | None documented |
| Copilot | `postToolUse` `{"modifiedResult":{"resultType":"success","textResultForLlm":…}}`; input `toolResult.textResultForLlm` | Hook deny; `--deny-tool='read(PATH)'` flag only (exact path, no glob); `sandbox.userPolicy.deniedPaths` in user settings only | `--secret-env-vars` redacts named variables from shell and MCP environments; `GITHUB_TOKEN` and `COPILOT_GITHUB_TOKEN` values are redacted from output by default |
| Gemini CLI | `AfterTool` `{"decision":"deny","reason":…}`: the reason replaces the result; input `tool_response` (`llmContent`, `returnDisplay`) | Hook deny; policy engine at user tier only (fact 0007); `.geminiignore` limits discovery, not reads | `security.environmentVariableRedaction` (`enabled`, default false; `allowed`, `blocked`), best effort, for shell and tool execution |
| Kilo | Plugin `tool.execute.after`: may rewrite `output.output`, `output.title`, `output.metadata` | Hook deny (plugin throws); `read` permission patterns (inherited from OpenCode, fact 0005) | None; `shell.env` only injects variables |
| OpenCode | Not documented (`tool.execute.after` exists) | Hook deny; `permission.read` patterns, default `"*.env": "deny"` | None; `shell.env` only injects variables |

- Plugin directories: `.kilo/plugin/` for Kilo, `.opencode/plugins/` for OpenCode.
- Tool names hooks see: Codex `Bash`, `apply_patch` (input `command`, the patch), `spawn_agent`, `update_plan`, `mcp__<server>__<tool>`; Cursor `Shell` (`command`, `working_directory`), `Read` and `Write` (`file_path`), `Grep`, `Delete`, `Task`, `MCP:<tool>`; Copilot `bash`, `powershell`, `view`, `create`, `edit`, `apply_patch`, `str_replace_editor`, `grep`, `rg`, `glob`, `web_fetch`, `web_search`, `task`, `update_todo`, `ask_user`, and `toolArgs` is an object.

## Not confirmed
- Copilot's `toolArgs` field names per tool; the shape of Codex's `tool_response`; whether Codex permission profiles load from a project `.codex/config.toml`; whether Gemini's redaction setting applies from workspace settings.
- OpenCode `tool.execute.after` mutating `output.output` (Kilo documents it; OpenCode's docs do not).
- Whether a Codex block or Gemini deny reason is shown to the model framed as a block rather than as the tool's output.

Sources (accessed 2026-10-06): https://learn.chatgpt.com/docs/hooks.md · https://learn.chatgpt.com/docs/config-file/config-reference.md · https://learn.chatgpt.com/docs/permissions · https://cursor.com/docs/hooks · https://docs.github.com/en/copilot/reference/hooks-reference · https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference · https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference · https://geminicli.com/docs/hooks/reference · https://geminicli.com/docs/reference/configuration/ · https://kilo.ai/docs/automate/extending/plugins · https://opencode.ai/docs/plugins/ · https://opencode.ai/docs/permissions/
