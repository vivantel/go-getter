---
id: 0109-scan-allow-paths
title: The secret scan skips a declared list of paths
status: active
date: 2026-10-10
tags: [practice-packs, governance, security]
track: process
accepted-by: sergemso
go-getter:
  scan-allow-paths: compiler/test/**
  generated-by: governance@0.3.0
  pack-answer: scan-allow-paths
  pack-option: [compiler/test/**]
---

## Decision

The secret scan skips the paths compiler/test/** (pack governance@0.3.0); an empty list skips none.

## Why

Fixtures and documentation hold fake keys on purpose, and a path is easier to review than a marker on every line (decision 0106).
