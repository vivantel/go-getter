---
id: 0077-restricted-path-modes
title: Restricted paths have an access mode, deny unless listed
status: active
date: 2026-10-05
tags: [practice-packs, governance, security]
track: process
accepted-by: sergemso
go-getter:
  restricted-modes: ""
  generated-by: governance@0.2.0
  pack-answer: restricted-modes
  pack-option: []
---

## Decision

A restricted path pattern listed in `go-getter.restricted-modes` as `use:<pattern>` or `sink:<pattern>` has that mode; every other one is `deny` (pack governance@0.2.0). Until `go-getter secret run` and `go-getter secret put` exist, `use` and `sink` paths are denied like `deny` paths, except to a call that is exactly `go-getter secret run` (for `use`) or `go-getter secret put` (for `sink`).

## Why

Agents need secrets they can use or fill without reading them, and no other go-getter command may be the exemption, since one that runs a user-supplied command would leak the content (decision 0072).
