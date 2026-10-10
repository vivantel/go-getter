---
id: 0022-telemetry-record-and-recorder
title: Telemetry records allow only short-identifier and numeric metadata fields; hook events record host, model, effort, outcome, a redaction count and documented token and cost fields only
status: active
date: 2026-10-05
tags: [observability, practice-packs, compiler]
kind: decision
governed-by: 0030-telemetry-pack-defaults
---

- `telemetry/schema.mjs` allows `ts`, `event`, `host`, `model`, `effort`, `taskClass`, `trigger`, `tokens` (`input`, `cacheRead`, `cacheWrite`, `output`), `cost`, `outcome`, `escalations`, `redactions`; any other field, or a string that is not a short identifier, is rejected.
- `telemetry/record.mjs` appends one line per step to the gitignored state log only when the active decision `go-getter.telemetry-recording` is `metadata-log`, and prunes lines older than `go-getter.telemetry-retention-days` (default 30) on every write. `recordQuietly` is for hooks and helpers: a telemetry failure never breaks the step.
- `go-getter hook` records `session-start` and `pre-tool` events with the host, the model and effort when the payload carries them, and the allow/deny outcome; `post-tool` events record the number of redactions in the tool result, never the result. Token and cost fields stay empty on hook events except a resumed Claude Code `session-start` (context tokens as cache write or read, the estimated cache-write cost; draft 0087) and on `route` records, which carry the handoff size in `tokens.input` and the expected cost (an estimate) in `cost` (fact 0025); `go-getter verify` records one pass/fail line per check without token or cost data (fact 0023).
- For the `host-otel` or OTLP export answer, `apply` writes Gemini CLI's workspace telemetry settings (prompts off) and reports every other host's OpenTelemetry as unavailable with the reason (draft 0087); `telemetry summary` adds `costByTaskClass`.
