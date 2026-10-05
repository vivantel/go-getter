---
id: 0020-agent-role-compilation
title: Project agent roles come from adopted decisions and are compiled by apply; four host tool mappings are unconfirmed
status: active
date: 2026-10-05
tags: [agent-roles, compiler, host-agents]
kind: decision
governed-by: 0014-agent-roles-compiled-to-native-agents
---

- Roles are data in the adopted orchestration decisions (`go-getter.roles`, `role-access`, `role-notes`, `handoff`, `escalation`), not files under `src/agents/` (0021); `apply` renders one agent file per role per host (0021 paths) and removes generated agent files of roles no longer in the roster.
- Read-only roles: Claude Code `tools: Read, Grep, Glob`; Codex `sandbox_mode = "read-only"`; Kilo and OpenCode `permission: edit, bash: deny`; Cursor `readonly: true`; Gemini CLI `tools: [read_file, list_directory, glob, grep_search]`; Copilot `tools: [read, search]`.
- Not confirmed against vendor docs: the Gemini CLI and Copilot tool names, the Kilo `.opencode/agents` path (fact 0005 note) and Kilo's `permission` keys.
- Pack templates may carry their own `go-getter` frontmatter data; the renderer merges it with `generated-by`, `pack-answer` and `pack-option` (extends 0022).
