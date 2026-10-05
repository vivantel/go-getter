---
id: 0026-claude-code-watcher-and-hook-context-levers
title: Claude Code delivers every watcher output line as a notification and offers no throttle; hook output enters context up to 10,000 characters
status: active
date: 2026-10-05
tags: [claude-code, hooks, cost, harness]
kind: environmental
governed-by: 0070-watcher-noise-is-a-project-policy
expires: 2027-01-04
---

- The Monitor tool "feeds each output line back to Claude"; every watch has a deadline (5 minutes default, 30 maximum, 10 with `-p`) and then ends with one notice. No batching, throttling or noise limit is documented. Monitor commands follow the Bash permission rules.
- Plugin monitors (`monitors/monitors.json`, key `experimental.monitors`; fields `name`, `command`, `description`, `when`) start with an interactive session or on first run of a named skill, never with `-p`, and are unavailable on Bedrock, Google Cloud's Agent Platform and Foundry. A monitor command cannot use `${user_config.*}` and receives no `CLAUDE_PLUGIN_OPTION_<KEY>`; only the path variables and the environment reach it.
- A hook's `additionalContext`, `systemMessage` and plain stdout are capped at 10,000 characters each; beyond that the text goes to a file and Claude sees the path and a 2,000-character preview. Command hooks take `async` and `asyncRewake` (wakes Claude on exit code 2 with stderr as a system reminder).
- Not confirmed: whether a `PreToolUse` hook can match and rewrite a Monitor call's `command`; whether any other host has a background watcher tool.

Sources (accessed 2026-10-05): https://code.claude.com/docs/en/tools-reference · https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/plugins/components · https://code.claude.com/docs/en/hooks
