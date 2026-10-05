---
id: 0051-telemetry-recording
title: Each routed step is recorded as one metadata JSON line in the local state directory
status: active
date: 2026-10-05
tags: [practice-packs, observability, harness]
track: process
accepted-by: sergemso
go-getter:
  telemetry-recording: metadata-log
  generated-by: telemetry@0.1.0
  pack-answer: recording
  pack-option: metadata-log
---

## Decision

Record one JSON line of metadata per step in the gitignored state directory (`telemetry.jsonl`): model, effort, token counts by cache state, cost, task class, outcome, escalations and timestamps, never prompt or file content (pack telemetry@0.1.0).

## Why

Routing calibration (decision 0017) needs outcomes on every host, and keeping data local avoids a new data-handling surface (decision 0018).
