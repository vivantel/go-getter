---
id: 0034-kilo-question-tool-gated-by-client
title: Kilo's question tool is on for the app, cli, desktop and vscode clients and otherwise needs KILO_ENABLE_QUESTION_TOOL
status: active
date: 2026-10-10
tags: [kilo, host-agents, interview]
kind: environmental
governed-by: 0003-guided-interview-only-setup
---

Kilo 7.6.2 registers its `question` tool (selectable options, custom answer allowed) when the client is `app`, `cli`, `desktop` or `vscode`, or when `KILO_ENABLE_QUESTION_TOOL` is set. Built-in agents allow it. Without an instruction to use it, models print options as plain text.
