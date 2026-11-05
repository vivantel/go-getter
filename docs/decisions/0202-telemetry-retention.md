---
id: 0202-telemetry-retention
title: The metadata log keeps 365 days
status: active
date: 2026-11-05
tags: [practice-packs, observability, harness]
track: process
accepted-by: sergemso
go-getter:
  telemetry-retention-days: "365"
  generated-by: telemetry@0.1.0
  pack-answer: retention
  pack-option: "365"
---

## Decision

Keep log lines for 365 days; every write prunes older lines (pack telemetry@0.1.0).

## Why

Calibration needs recent data only, and old metadata is a liability without a use.
