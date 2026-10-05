---
id: 0019-vendored-kms-packaging
title: How vendored knowledge-base tooling 0.15.0 is packaged and where it falls short
status: active
date: 2026-10-05
tags: [kms, vendoring, packaging]
kind: decision
governed-by: 0006-vendor-kms-as-builtin-pack
---

- The plugin ships kms's skills plus `shared/` and `templates/` at its root, so `../../shared/...` references resolve.
- kms's two hooks (`capture-nudge.sh`, `lint-nudge.sh`: POSIX sh, plain-text output) are not plugin content; `apply` installs them as session-start hooks via `go-getter hook session-start` when the project has a kms knowledge base.
- Kilo remote skills (`skills/index.json`) carry only each skill's own files, so kms's `../../shared` and `../../templates` references do not resolve for remote installs; `apply` closes the gap by writing project-local `.agents/{skills,shared,templates}` (default for Kilo and OpenCode, `--skills` elsewhere).
