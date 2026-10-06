---
id: 0076-watcher-noise
title: Watchers are quiet
status: draft
date: 2026-10-05
tags: [practice-packs, harness, cost]
track: process
go-getter:
  watcher-noise: quiet
  generated-by: context@0.2.0
  pack-answer: watcher-noise
  pack-option: quiet
---

## Decision

Watchers started through `go-getter watch` report state changes and a final summary, collapse duplicates and bursts (60 s window) and stop after 6 notifications an hour with one notice; `--until done` prints one result. (pack context@0.2.0.)

## Why

Each watcher line can wake a model turn that re-reads the whole context from cache, and hosts offer no throttle.

## Status

Recorded by an agent from decision 0070's recommended default; the owner should confirm it (set `status: active` and `accepted-by`). Until then `go-getter watch` uses the plugin default, also `quiet`.
