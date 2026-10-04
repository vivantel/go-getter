---
id: 0007-kms-artifacts-as-configuration-source-of-truth
title: A project's chosen practices live only as kms artifacts, with machine-readable data under a go-getter frontmatter key
status: active
date: 2026-10-04
tags: [kms, configuration, enforcement]
track: process
accepted-by: sergemso
---

## Decision

The practices a project chooses are stored only as kms artifacts under `docs/` — decisions (commitments), guardrails (rules), procedures (how-to), facts (e.g. model pricing). There is no separate go-getter config file.

Everything go-getter tooling must read deterministically lives under one optional, namespaced frontmatter key, `go-getter:`, which kms ignores:

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

Tooling never parses prose. Runtime state (telemetry, worktree claims) is not configuration and lives in gitignored `.go-getter/state/`. The `go-getter:` key is to be proposed upstream to kms later.

## Why

The user chose a single, human-readable source of truth that also records rationale, and wants go-getter dogfooded on kms. One namespaced key keeps kms's own schema untouched.

## Tradeoffs considered

- **Declarative config file + kms rationale** (assistant's recommendation): clean machine-readable settings, but two artifacts. Rejected by the user.
- **Generated host files only**: simplest, but settings cannot be diffed or re-applied. Rejected.
- **Cost accepted**: structured data such as routing policy lives in frontmatter, which is less ergonomic than a dedicated file; kms tooling must tolerate the unknown key until kms adopts it.
