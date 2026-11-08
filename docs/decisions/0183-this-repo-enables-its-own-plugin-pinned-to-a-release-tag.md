---
id: 0183-this-repo-enables-its-own-plugin-pinned-to-a-release-tag
title: This repo enables its own plugin in project settings, pinned to a release tag by apply
status: active
date: 2026-11-01
tags: [dogfooding, ci, roadmap]
track: process
accepted-by: sergemso
go-getter:
  self-plugin:
    marketplace: go-getter
    repo: vivantel/go-getter
fitness-functions:
  - CI fails when the pinned marketplace ref is older than the latest release tag
  - doctor reports an installed plugin version that differs from the CLI version and prints the update command
---

## Decision

The `self-plugin` answer makes `go-getter apply` write, into Claude Code's project settings, `extraKnownMarketplaces` (the repo's marketplace at `ref: v<CLI version>`) and `enabledPlugins`. Only a project that gives the answer gets them; other settings keys are kept. `go-getter doctor` compares the plugin version the host has installed for the project with the CLI version and prints the fix on a mismatch and exits 1. `check plugin-pin` fails when the pinned ref is older than the latest release tag.

## Why

On 2026-10-31 the plugin was not installed here, so the `/go-getter:*` skills were missing and the cached plugin (0.3.6) lagged the repo (0.4.1). Decision 0010 requires this repo to run on its own product. Claude Code's `enabledPlugins` carries no version, so the marketplace `ref` is the only place a pin can live.

## Tradeoffs considered

- **Unpinned marketplace**: no bump after a release, but versions drift again and no check can catch it.
- **Emit for every project**: broader than the fix needs and changes every adopter's settings; would need its own decision.
- **Cost accepted**: each release needs `go-getter apply` to move the pin before the check passes.
