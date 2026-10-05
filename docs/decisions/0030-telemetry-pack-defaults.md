---
id: 0030-telemetry-pack-defaults
title: The telemetry pack recommends a local metadata log kept 30 days with no export
status: active
date: 2026-10-05
tags: [practice-packs, observability, governance]
track: product
accepted-by: sergemso
---

## Decision

The `telemetry` harness pack (component 12, minimal for v0.1) recommends:

1. Recording: **one metadata JSON line per routed step in `.go-getter/state/telemetry.jsonl`** (alternatives host OTel export only, off). Fields per guardrail `telemetry-records-metadata-only`; partial where a host's hooks lack token data.
2. Retention: **30 days** (numeric; pruned on write).
3. Export: **none**; team export comes with the v0.2 observability pack.

## Why

Routing calibration (0017) needs outcomes on every host; OTel exists on only three (fact 0009), and keeping data local avoids a new data-handling surface (0018).

## Tradeoffs considered

- **OTel-only**: richest data, nothing on three hosts, needs a collector.
- **Optional endpoint now**: team visibility early, at the cost of setup and DLP review.
