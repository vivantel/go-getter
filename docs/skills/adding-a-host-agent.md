---
id: adding-a-host-agent
title: Procedure for adding a host agent to the compiler
status: active
date: 2026-10-04
tags: [host-agents, compiler, harness, procedural]
uses:
  - 0002-agent-harness-and-host-agent-terminology
  - 0009-tiered-enforcement-git-ci-floor#Decision
  - 0087-host-otel-settings-only-where-project-config-accepts-them#Decision
---

## Procedure

1. **Read primary sources.** Fetch the vendor's own documentation, not search summaries. Record an environmental fact in `docs/facts/` covering:
   - instruction file(s); skill, agent/subagent and command formats; plugin/packaging and install; headless invocation
   - hooks (events, schema, can they block) and permissions (path/tool deny)
   - per-agent model selection and effort/reasoning control; local or custom model endpoints
   - prompt caching behavior and whether cache usage and cost are visible
   - telemetry/export (e.g. OpenTelemetry), whether project config accepts it, and token/cost fields in hook payloads
   - DLP levers: path deny, tool-output filtering/redaction
   - which of the 12 harness components (fact 0002) it provides natively
   - whether Node is available in its environment
   
   Record what you could not confirm; do not drop it.
2. **Write the capabilities manifest**, `compiler/capabilities/<host>.json`, from the fact: features present and the enforcement tier (0009) reachable per harness component.
   Add the host to `compiler/src/telemetry/otel.mjs`: its project OpenTelemetry settings, or the reason it has none (decision 0087).
3. **Find symlink opportunities.** For each output, check whether the native file is byte-identical to one already emitted; if so, emit a symlink (with the copy-mode fallback).
4. **Write the adapter**, `compiler/adapters/<host>.mjs`, emitting native files from neutral source. Where a feature is missing, fall back to the next tier down and mark the output advisory for that host.
5. **Add golden output** for the host under the compiler tests and run `npm run check:generated`.
6. **Add an eval case** that runs the `init` interview on this host on demand.
7. **Update `INSTALLING.md`, the README and the harness coverage report**, then record a decision if the host changes a commitment (e.g. it cannot meet a DLP class).
