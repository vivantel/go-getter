---
id: 0033-apply-keeps-no-record-of-what-it-wrote
title: apply keeps no record of what it wrote, so it cannot undo settings or tell its content from the user's
status: active
date: 2026-10-06
tags: [generated-files, enforcement]
kind: environmental
governed-by: 0089-apply-records-ownership-in-a-manifest
expires: 2027-01-04
---

Observed in `compiler/src/apply.mjs` and `compiler/src/agents.mjs` on 2026-10-06:

- `apply` recomputes every output from the adopted docs and the installed package and rewrites whole files, including merged host settings files; `apply --check` compares them byte for byte.
- It deletes only stale agent files (`staleAgentFiles`). Settings keys it set (prompt logging, cache lifetimes, OpenTelemetry), the `core.hooksPath` git setting, hook entries, the instruction-file block and `.go-getter/` are never removed or restored.
- `reconfigure` re-renders pack artifacts in `docs/` from recorded answers; `apply` neither calls it nor reports a pack older than the installed package.
- The `uninstall` skill covers only what `bootstrap` and `capture` seeded.
