---
id: 0018-plugin-manifest-shapes
title: Manifest shapes the adapters emit for Agent Plugins 1.0 and Codex
status: active
date: 2026-10-05
tags: [packaging, cursor, copilot, codex]
kind: environmental
governed-by: 0021-neutral-source-and-output-layout
---

- **Agent Plugins 1.0** (Cursor, Copilot): `plugin.json` with `$schema` and `name` required and metadata only; components are found by directory convention, so `plugins/go-getter/plugin.json` sits next to the shared `skills/`. Source: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json (accessed 2026-10-05).
- **Codex marketplace** entries (`source: {source: local, path}`, `policy: {installation: AVAILABLE, authentication: ON_INSTALL}`, `category`) follow third-party descriptions only; unconfirmed until plan step 6.3.
