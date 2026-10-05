---
id: 0049-prompt-logging
title: Host prompt logging is disabled on every host
status: active
date: 2026-10-05
tags: [practice-packs, governance, observability]
track: process
accepted-by: sergemso
go-getter:
  prompt-logging:
    scope: all
  generated-by: governance@0.1.0
  pack-answer: prompt-logging
  pack-option: disable-everywhere
---

## Decision

`go-getter apply` switches off prompt and content logging in every host setting that has one (pack governance@0.1.0).

## Why

A host that logs prompts by default would copy restricted content into its telemetry (decision 0018).
