---
id: 0015-distributable-packaging-resolutions
title: How the adapters resolved decision 0021's open packaging points
status: active
date: 2026-10-05
tags: [packaging, compiler, generated-files]
kind: decision
governed-by: 0021-neutral-source-and-output-layout
---

- **Gemini CLI**: an extension root must hold both `gemini-extension.json` and `skills/`, and installs take a whole GitHub repo (no subdirectory option documented). The repo root therefore carries `gemini-extension.json` plus a generated `skills` → `plugins/go-getter/skills` symlink (a copy in copy mode).
- **Agent Plugins 1.0** (Cursor, Copilot) defines metadata only (`$schema`, `name` required; no component fields); components are found by directory convention, so `plugins/go-getter/plugin.json` sits next to the shared `skills/`.
- **Codex marketplace** entry shape (`source: {source: local, path}`, `policy: {installation: AVAILABLE, authentication: ON_INSTALL}`, `category`) comes from third-party descriptions only; verify in plan step 6.3.
- **Distributable packaging ships skills only.** Agent definitions, hooks and permissions depend on each project's pack answers, so they are project-local output written by `apply` (output kind B).
- Claude Code's `claude plugin validate --strict` passes on the generated plugin and marketplace.
