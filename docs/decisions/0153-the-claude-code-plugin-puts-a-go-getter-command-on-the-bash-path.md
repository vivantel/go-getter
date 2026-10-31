---
id: 0153-the-claude-code-plugin-puts-a-go-getter-command-on-the-bash-path
title: The Claude Code plugin ships bin/go-getter so a skill's bare go-getter command runs the bundled CLI
status: draft
date: 2026-10-31
tags: [packaging, claude-code, tooling, generated-files]
track: process
---

## Decision

`compile` emits `plugins/go-getter/bin/go-getter` (mode 755) for Claude Code. Claude Code puts a plugin's `bin/` on the Bash tool's PATH while the plugin is enabled, so `go-getter <command>` in any skill runs the CLI bundled with `go-getter-init` (0093). The shim is generated, never hand-edited. When the bundled CLI or Node is missing it prints why and exits 127, so the agent stops instead of choosing refs or checks itself.

## Why

`attribute` told the agent to run `go-getter refs --staged`, but only `go-getter-init` knew where the CLI lives and nothing put a `go-getter` command on the PATH. The agent saw "not installed", skipped the deterministic Refs selection and picked trailers from the plan's text.

## Tradeoffs considered

- **Resolve the CLI in each skill's text**: repeats the lookup in every skill and leaves the fallback to the agent's judgment.
- **Shim only on Claude Code**: other hosts keep the skill-directory route until their PATH behavior is confirmed.
