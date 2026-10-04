---
id: 0001-kms-host-agent-packaging-coverage
title: kms 0.15.0 ships native packaging for three host agents - Claude Code, Codex and Kilo
status: active
date: 2026-10-04
tags: [kms, host-agents, packaging]
kind: environmental
governed-by: 0006-vendor-kms-as-builtin-pack
---

kms 0.15.0 packages three host agents: a Claude Code marketplace (`.claude-plugin/marketplace.json`, `plugins/kms/.claude-plugin/plugin.json`), a Codex plugin (`plugins/kms/.codex-plugin/plugin.json`) and a Kilo remote-skills manifest (`kilo.jsonc` → `plugins/kms/skills/index.json`). It has no Cursor, Gemini CLI or Copilot packaging.

A kms plugin root holds `skills/`, `hooks/`, `shared/` and `templates/`; skill bodies are agent-neutral and reference `../../shared/artifact-model.md`.

Source: `vivantel/kms` README and AGENTS.md at 0.15.0.
