---
id: 0089-apply-records-ownership-in-a-manifest
title: apply records what it owns in .go-getter/manifest.json and never overwrites or removes a modified owned item without --force
status: draft
date: 2026-10-06
tags: [generated-files, enforcement, configuration]
track: process
governed-facts: [0033-apply-keeps-no-record-of-what-it-wrote]
---

## Decision

Draft from the owner's interview on updating and removing go-getter (2026-10-06); active under decision 0091.

- `apply` writes a committed `.go-getter/manifest.json`: a `schema` number, the go-getter version, each adopted pack and its version, every whole file it owns with a content hash, and for each shared file the keys or marked blocks it owns with the value they replaced (including `core.hooksPath`).
- A later `apply`, `update` or `--remove` (0090) works from the diff between the manifest and the target outputs.
- An owned file, key or block that no longer matches the manifest is skipped and reported as `modified`; the command exits non-zero. `--force` overwrites or removes it.
- `update` refuses a manifest whose `schema` is newer than it understands.

## Why

Updating and removing both need to tell go-getter's content from the user's. Re-deriving from the installed package fails exactly in the update case, and markers cannot cover plain settings keys.

## Tradeoffs considered

- **Markers inside each file**: no extra file, but JSON has no comments and settings keys carry none, so undo stays impossible for them.
- **Re-derive from the current package**: no new state, but wrong whenever the installed version differs from the one that wrote the files.
- **Overwrite with a backup, or fail the whole run on any edit**: the first silently drops an edit, the second lets one stray edit block every update.
