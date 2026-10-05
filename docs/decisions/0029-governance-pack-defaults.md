---
id: 0029-governance-pack-defaults
title: The governance pack recommends blocking restricted paths, paid no-training cloud providers, optional ZDR and no prompt logging
status: active
date: 2026-10-05
tags: [practice-packs, governance, security]
track: product
accepted-by: sergemso
---

## Decision

The `governance` harness pack (component 7, decision 0018) recommends:

1. Restricted paths: **detected sensitive paths + standard env/key patterns + a custom list** (text list question).
2. Enforcement: **host pre-tool hook blocks agent access (tier 2) and CI/pre-push fail if one is tracked (tier 3)**.
3. Internal data may go to **approved cloud providers on paid, no-training terms** (alternatives single provider, local only).
4. Confidential data requires zero-data-retention endpoints: **no by default, offered when the project has ZDR**; the confidential class stays.
5. Host telemetry prompt/content logging: **disabled everywhere** by `apply`.
6. Hosts near restricted data: **hosts with blocking pre-tool hooks**; the coverage report flags any host where DLP is only advisory.

## Why

DLP must not depend on agent compliance (0018); prompt logging defaults (Gemini CLI, fact 0007) would otherwise leak restricted content into telemetry.

## Tradeoffs considered

- **Local-only models**: strongest control, but only three hosts can reach local endpoints (fact 0014).
- **ZDR by default**: makes confidential data unroutable for teams without a ZDR agreement.
