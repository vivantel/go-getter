---
id: 0027-claude-code-secret-use-and-output-redaction-levers
title: Claude Code can deny or mask credentials for sandboxed shell commands (mask only from user or managed settings) and can replace tool output from a hook
status: active
date: 2026-10-05
tags: [claude-code, governance, security, hooks]
kind: environmental
governed-by: 0072-restricted-paths-have-access-modes
expires: 2027-01-04
---

- `sandbox.credentials` lists files and environment variables as `deny` (unreadable, variable unset) or `mask` (the command sees a per-session sentinel and the sandbox proxy substitutes the real value on requests to allowed hosts). Masking needs `network.tlsTerminate`. `mask` entries are honored only from user settings, managed settings and `--settings`, never from a repository's `.claude/settings*.json`; `deny` entries merge from every scope.
- The sandbox covers Bash, PowerShell and Monitor commands only. `filesystem.denyRead` does not stop the Read tool (permission rules govern it), and hooks and MCP servers run outside it. There is no built-in credential list, and native Windows has no sandbox.
- A `PostToolUse` hook can replace a tool's result with `hookSpecificOutput.updatedToolOutput`. `UserPromptSubmit` can block a prompt or add `additionalContext` but cannot rewrite the prompt.
- Not confirmed: which tools accept `updatedToolOutput`; the equivalent levers on the other six hosts (see facts 0004-0008 for their hook surfaces).

Sources (accessed 2026-10-05): https://code.claude.com/docs/en/sandboxing · https://code.claude.com/docs/en/hooks
