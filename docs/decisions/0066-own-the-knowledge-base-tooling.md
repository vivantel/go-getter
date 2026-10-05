---
id: 0066-own-the-knowledge-base-tooling
title: go-getter owns its knowledge-base tooling and artifact format; nothing is vendored or synced
status: active
date: 2026-10-05
tags: [knowledge-base, configuration, vendoring, packaging]
track: process
accepted-by: sergemso
fitness-functions:
  - The compiler builds all skills and templates and support files from src/ and nothing reads a vendor directory
---

## Decision

Supersedes 0006 (vendor the tooling as a built-in pack) and 0007 (artifacts as the configuration source of truth), restating the latter's rule below.

1. The skills, templates, shared artifact model and session nudge scripts that were vendored under `vendor/` are go-getter's own source under `src/` (`skills/`, `templates/`, `shared/`, `hooks/`). They are edited here and compiled to every host agent like the rest of `src/`. There is no upstream to sync from: no pinned ref, no lockfile, no sync script and no vendor check.
2. The practices a project chooses are stored only as knowledge-base artifacts under `docs/` — decisions (commitments), guardrails (rules), procedures (how-to), facts (e.g. model pricing). There is no separate go-getter config file.
3. Everything go-getter tooling must read deterministically lives under one optional, namespaced frontmatter key, `go-getter:`. It is part of go-getter's own artifact format and is not proposed to any other project:

```yaml
go-getter:
  enforcement:                      # on guardrails (0009)
    - tier: 3                       # 1 instruction | 2 host hook/permission | 3 git hook / CI
      check: "one-line human description of what is checked"
      run: "built-in check id with params, or a command"   # required for tier 2 and 3
  generated-by: <pack-id>@<version> # on pack-emitted artifacts (0008)
  pack-answer: <question-id>
  # pack-specific structured data, e.g. routing policy (0016), data classes and model registry (0018)
```

4. Tooling never parses prose. Runtime state (telemetry, worktree claims) is not configuration and lives in the gitignored runner state directory.
5. The knowledge base is the harness's long-term memory for decisions, facts and rules (component 5) until a dedicated memory pack exists (0004).

## Why

go-getter's design makes its artifacts the single source of truth and ships the skills that maintain them on every host. A copy that may never be edited locally blocks fixing the skills it ships, ties the format to a project go-getter does not control, and needs a sync script, a lockfile and a check to keep it that way. Owning the source removes that machinery and lets the skills describe go-getter in go-getter's own terms.

## Tradeoffs considered

- **Keep vendoring and syncing** (0006): upstream changes arrive for free, but go-getter stays dependent on an external project and cannot fix what it ships.
- **Propose the `go-getter:` key upstream** (0007): would keep two projects' formats aligned, at the cost of the dependency this decision removes.
- **Cost accepted**: go-getter maintains the skills and templates itself; anyone still installing the former upstream does not receive its changes.
