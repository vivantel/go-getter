---
id: 0034-kilo-question-tool-gated-by-client
title: Kilo's question tool is on for the app, cli, desktop and vscode clients and otherwise needs KILO_ENABLE_QUESTION_TOOL
status: active
date: 2026-10-10
tags: [kilo, host-agents, interview]
kind: environmental
governed-by: 0003-guided-interview-only-setup
---

Kilo 7.6.2 registers its `question` tool (selectable options, custom answer allowed) when the client is `app`, `cli`, `desktop` or `vscode`, or when `KILO_ENABLE_QUESTION_TOOL` is set. Built-in agents allow it. A model that is not told to use it prints options as plain text, so the init skill says to ask through the host's question tool when one exists.
