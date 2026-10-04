---
id: 0005-neutral-source-compiler-architecture
title: Author content once in a neutral source and compile it to each host agent's native files
status: active
date: 2026-10-04
tags: [architecture, compiler, generated-files, agent-agnostic]
track: process
accepted-by: sergemso
fitness-functions:
  - CI regenerates all host output and fails on any diff against the committed files
---

## Decision

Skills, agents, commands, rules and practice packs are authored once in a neutral source (Markdown with frontmatter, plus data files for packs) together with a per-host capabilities manifest. A Node compiler (0011) emits each host agent's native files: plugin manifests, rules, agent definitions, hooks, permission settings, instruction files.

Where a host's native file is byte-identical to another's (e.g. `SKILL.md`, `CLAUDE.md` → `AGENTS.md`), the compiler emits a symlink instead of a copy, with a copy-mode fallback where symlinks are unreliable (Windows).

Generated files are committed so git-based installs need no build step; CI regenerates and fails on drift.

Two kinds of output exist: the distributable packaging of go-getter itself, and the project-local host files `init` generates for an adopting project (including this repo, per 0010).

## Why

Six host agents (0002) with one body of content makes drift the main risk; one source of truth plus a mechanical check removes it.

## Tradeoffs considered

- **Neutral skills + hand-written thin adapters**: no build step, but adapters drift and nothing checks they agree.
- **Runtime installer only**: nothing committed per host, but setup depends on a CLI and network at install time.
- **Cost accepted**: the compiler must exist before content ships; symlinks need a copy-mode fallback.
