---
id: 0023-cli-distributed-via-npx-from-github
title: Skills invoke the go-getter CLI through npx from the GitHub repository
status: active
date: 2026-10-05
tags: [packaging, nodejs, tooling]
track: process
accepted-by: sergemso
---

## Decision

Skills run the CLI as `npx --yes github:vivantel/go-getter <command>` (pinned to a release tag once releases exist, e.g. `#v0.1.0`). The package has no runtime dependencies (0019), so npx installs it from the repo with no build step; packs and schemas ship inside it.

## Why

Distributable packaging carries skills only (fact 0015), so adopting projects need another way to run `detect`, `render-pack`, `apply` and `check`. Node is already a prerequisite (0019) and npx works identically on all six hosts.

## Tradeoffs considered

- **Publish to the npm registry**: faster cached installs, but needs a registry name and a publish step on every release. Can be added later without changing skills beyond the command prefix.
- **Ship the CLI in the plugin's `bin/`**: no network at run time, but only one host puts plugin binaries on PATH.
- **Cost accepted**: first use needs network access to GitHub; machines without Node fall back to advisory mode per 0019.
