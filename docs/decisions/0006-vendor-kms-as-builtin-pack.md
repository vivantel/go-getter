---
id: 0006-vendor-kms-as-builtin-pack
title: kms is vendored into go-getter as a built-in pack, synced from upstream
status: active
date: 2026-10-04
tags: [kms, vendoring, packaging]
track: process
accepted-by: sergemso
governed-facts: [0001-kms-host-agent-packaging-coverage]
fitness-functions:
  - The vendored kms tree equals upstream vivantel/kms at the pinned ref
---

## Decision

go-getter's source includes kms's skills, templates and shared files (`vendor/kms/`), copied from upstream `vivantel/kms` at a pinned ref by a sync script (`docs/skills/syncing-vendored-kms.md`) and compiled to all six host agents. Vendored files are never edited locally. kms remains a standalone product and the upstream authority for its artifact model.

kms also serves as the harness's long-term memory for decisions, facts and rules (component 5) until a dedicated memory pack exists (0004).

## Why

kms artifacts are go-getter's configuration source of truth (0007), so kms must be present on every host with a single install. kms itself packages only three host agents (fact 0001); go-getter's compiler covers the rest.

## Tradeoffs considered

- **Absorb kms and retire the repo**: one codebase, but breaks existing kms installs and ends kms as a standalone product.
- **Declared dependency, installed separately**: clean boundary, but two installs and no dependency resolution on most hosts.
- **Cost accepted**: a sync mechanism and possible version skew between the pin and upstream.
