---
id: 0033-apply-keeps-no-record-of-what-it-wrote
title: Until the manifest (0089), apply kept no record of what it wrote, so it could not undo settings or tell its content from the user's
status: active
date: 2026-10-06
tags: [generated-files, enforcement]
kind: environmental
governed-by: 0089-apply-records-ownership-in-a-manifest
expires: 2027-01-04
---

Observed before the manifest landed (2026-10-09) in `compiler/src/apply.mjs` and `compiler/src/agents.mjs` on 2026-10-06:

- `apply` recomputes every output from the adopted docs and the installed package and rewrites whole files, including merged host settings files; `apply --check` compares them byte for byte.
- It deletes only stale agent files (`staleAgentFiles`). Settings keys it set (prompt logging, cache lifetimes, OpenTelemetry), the `core.hooksPath` git setting, hook entries, the instruction-file block and `.go-getter/` are never removed or restored.
- `reconfigure` re-renders pack artifacts in `docs/` from recorded answers; `apply` neither calls it nor reports a pack older than the installed package.
- The `uninstall` skill covers only what `bootstrap` and `capture` seeded.

Since 2026-10-09 `apply` writes `.go-getter/manifest.json` (decision 0089) and `update` and `apply --remove` work from it (0090); this fact records the state they replaced.
