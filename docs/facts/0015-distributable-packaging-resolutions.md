---
id: 0015-distributable-packaging-resolutions
title: Distributable packaging ships skills only, with a Gemini-compatible repo root
status: active
date: 2026-10-05
tags: [packaging, compiler, generated-files]
kind: decision
governed-by: 0021-neutral-source-and-output-layout
---

- **Skills only**: agent definitions, hooks and permissions depend on each project's pack answers, so they are project-local output of `apply` (output kind B), not plugin content.
- **Gemini CLI**: an extension root must hold both `gemini-extension.json` and `skills/`, and installs take a whole GitHub repo, so the repo root carries `gemini-extension.json` plus generated `skills`, `shared` and `templates` symlinks into `plugins/go-getter/` (copies in copy mode).
- `claude plugin validate --strict` passes on the generated plugin and marketplace.
