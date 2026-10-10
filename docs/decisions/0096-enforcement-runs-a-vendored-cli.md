---
id: 0096-enforcement-runs-a-vendored-cli
title: apply copies the CLI into the project and the generated runner runs that copy before npx
status: active
date: 2026-10-10
tags: [packaging, nodejs, generated-files, enforcement]
track: process
accepted-by: sergemso
---

## Decision

`apply` writes the CLI it runs from to `.go-getter/cli/` (the same file set as the skill bundle in 0093), as owned files in the manifest. The generated runner runs, in order: a go-getter checkout's compiler, `GO_GETTER_CLI`, `.go-getter/cli`, then npx pinned to the release tag (0023). A go-getter checkout gets no copy.

## Why

Issue #19: setup succeeded through the bundled CLI, then every hook printed a non-blocking npm error (`EALLOWGIT`) and nothing was enforced, silently. Hooks, the pre-push check and CI now run with no network, and the CLI version equals the version that wrote the runner.

## Tradeoffs considered

- **Record the bundled CLI's path**: a machine-specific path in a committed file; wrong on teammates' machines and after plugin cache version changes.
- **Inline policy into generated hook files**: no CLI needed for hooks, but `check` and `verify` still need one, and it is the largest redesign.
- **Document only**: leaves the first-run loss of enforcement.
- **Cost accepted**: about 750 KB (108 files) committed per adopter; `go-getter update` keeps the copy current, and a hand-edited file is kept and reported, not overwritten (`owned-files-never-clobbered`).
