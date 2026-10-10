---
id: 0087-host-otel-settings-only-where-project-config-accepts-them
title: apply writes host OpenTelemetry settings only where a host's project config accepts them, and fills token and cost fields only from documented hook data
status: active
date: 2026-10-06
tags: [observability, cost, enforcement]
track: product
accepted-by: sergemso
governed-facts: [0022-telemetry-record-and-recorder]
---

## Decision

- For the `host-otel` recording or the `otlp` export answer (0030), `apply` writes OpenTelemetry settings into project files only with setting names from vendor docs and where the host reads them from the project: today Gemini CLI (`telemetry.enabled`, `target: local`, `otlpEndpoint`, `otlpProtocol: http`, `logPrompts: false`). Claude Code and Codex accept them only in user or managed config, and the other hosts document no export; for them `apply` writes nothing and reports the host unavailable with the reason.
- The endpoint is the adopted OTLP endpoint, else `http://localhost:4318` (a local collector, so the `host-otel` answer exports nothing off the machine by itself).
- Hook events take token and cost fields only from fields the host documents in its hook payload: today Claude Code's resumed `SessionStart` (`context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`). Gemini CLI's `AfterModel` total token count is not split by cache state and is not recorded.
- `telemetry summary` adds cost per task class; costed records without a class count as `unclassified`.

## Why

A project-scoped tool must not edit a developer's user config, and an unconfirmed key would silently do nothing (or something else); reporting the gap keeps coverage honest. Prompts stay out of every export (guardrails `prompt-logging-disabled`, `telemetry-records-metadata-only`).

## Tradeoffs considered

- **Write user-level config** (`~/.claude/settings.json`, `~/.codex/config.toml`): covers two more hosts, but changes state outside the project that `apply --check` cannot see.
- **Read token usage from host transcripts**: fuller data on Claude Code, but the transcript format is undocumented and holds prompt content.
- **go-getter's own OTLP exporter for the metadata log**: deferred; the `otlp` answer configures host exports only.
