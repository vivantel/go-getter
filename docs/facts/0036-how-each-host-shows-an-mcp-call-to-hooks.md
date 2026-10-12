---
id: 0036-how-each-host-shows-an-mcp-call-to-hooks
title: Only Claude Code and Codex are confirmed to show an MCP call as mcp__server__tool; Cursor shows no server; Cursor's output can be replaced for MCP only
status: active
date: 2026-10-12
tags: [hooks, host-agents, security]
kind: environmental
governed-by: 0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned
last-verified: 2026-10-12
---

From facts 0003-0008 and 0031 and the capability rows; no new web research. Source of each cell is in the quoted fact; "unconfirmed" means no repository fact states it.

| Host | Tool name in a hook | Hook can deny it | Hook can replace its result | Native deny rule for a server |
|---|---|---|---|---|
| Claude Code | `mcp__<server>__<tool>` (the runtime already matches `^mcp__`, `hook.mjs:499`); server names are normalised by the host, so spellings differ from the configured name (unconfirmed rules) | yes (`PreToolUse`, exit 2 or `permissionDecision`) | yes; MCP results use `updatedMCPToolOutput` (`hook.mjs:519`) | `permissions.deny` entries for `mcp__<server>`; permission rule syntax for MCP not in fact 0003 (unconfirmed) |
| Codex | `mcp__<server>__<tool>` (fact 0031) | yes (`PreToolUse` fires on MCP tools, fact 0004) | yes (`PostToolUse` fires for MCP; the result is replaced by the block reason) | none documented |
| Cursor | `MCP:<tool>`, no server (fact 0031) | yes (`beforeMCPExecution` / `preToolUse`, fact 0006) | MCP results only (`updated_mcp_tool_output`, fact 0031) | `Mcp(server:tool)` in `.cursor/cli.json` `permissions.deny` (fact 0006) |
| Gemini CLI | unconfirmed; subagent tool lists use `mcp_*` (fact 0007) | yes (pre-tool hook, fact 0007) | yes (`AfterTool` deny reason replaces the result) | policy engine at user tier only (fact 0007) |
| Copilot | unconfirmed (fact 0031 lists no MCP name) | yes (hook deny) | yes (`modifiedResult`), for tools generally | none documented |
| Kilo | unconfirmed | yes (plugin throws) | yes (plugin `tool.execute.after` sets `output.output`) | permission patterns inherited from OpenCode (fact 0005); MCP form unconfirmed |
| OpenCode | unconfirmed | yes (plugin throws) | not documented (fact 0031) | permission patterns (fact 0005); MCP form unconfirmed |

Consequences for 0138:

- A server allowlist can be applied from the hook only where the name carries the server: Claude Code and Codex. Cursor has a native rule; Gemini CLI, Copilot, Kilo and OpenCode are advisory for the allowlist until their name shape is confirmed.
- Result masking works on Claude Code, Codex, Gemini CLI, Copilot and Kilo through the hook, and on Cursor for MCP only (capability `rewriteOutput` is false for Cursor; the capability `rewriteMcpOutput` marks it, and `apply` writes its post-tool hook when MCP governance is adopted). OpenCode cannot replace.
- Only Claude Code can ask from its hook (`askPreTool`); on the others an MCP write needs a recorded approval or a run grant.

## Not confirmed
- The tool-name shape of MCP calls on Gemini CLI, Copilot, Kilo and OpenCode, and Claude Code's server-name normalisation.
- The Claude Code permission rule form for an MCP server or tool.
- Whether Kilo and OpenCode name MCP tools with a server prefix in `tool.execute.before`.
- The field names of Cursor's `postToolUse` input (go-getter reads `tool_output` and the other aliases of `evaluatePostTool`) and whether its hook fires for every tool or only MCP ones; the answer `updated_mcp_tool_output` is from fact 0031.
