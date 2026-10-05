---
id: 0022-telemetry-record-and-recorder
title: Telemetry records allow only short-identifier and numeric metadata fields; hook events record host, model, effort and outcome only
status: active
date: 2026-10-05
tags: [observability, practice-packs, compiler]
kind: decision
governed-by: 0030-telemetry-pack-defaults
---

- `telemetry/schema.mjs` allows `ts`, `event`, `host`, `model`, `effort`, `taskClass`, `tokens` (`input`, `cacheRead`, `cacheWrite`, `output`), `cost`, `outcome`, `escalations`; any other field, or a string that is not a short identifier, is rejected.
- `telemetry/record.mjs` appends one line per step to the gitignored state log only when the active decision `go-getter.telemetry-recording` is `metadata-log`, and prunes lines older than `go-getter.telemetry-retention-days` (default 30) on every write. `recordQuietly` is for hooks and helpers: a telemetry failure never breaks the step.
- `go-getter hook` records `session-start` and `pre-tool` events with the host, the model and effort when the payload carries them, and the allow/deny outcome. Hook payloads carry no token or cost data, so those fields stay empty until the route and verify helpers (plan 5.5, 5.6) record steps.
- `host-otel` and the OTLP export answers are recorded as decisions only; `apply` does not yet write host OpenTelemetry settings.
