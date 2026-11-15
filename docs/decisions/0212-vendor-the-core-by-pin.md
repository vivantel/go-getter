---
id: 0212-vendor-the-core-by-pin
title: Vendor the core at a kms release tag, checked by check core-pin and updated by core update
status: draft
date: 2026-11-15
tags: [knowledge-base, vendoring, packaging]
---

## Decision

`shared/core/` holds byte-identical copies of kms `artifact-model.md`, `lint_check.py`, `migrate.py` and the conformance fixtures from tag `kms-schema-<version>`. `check core-pin` fails when a copy differs from the recorded tag or the recorded schema version differs from the model's first line; `go-getter core update <tag>` copies from a local kms checkout. Not a runtime dependency, submodule or package.

## Why

go-getter already has `check plugin-pin`, `check deps` and `check generated`; four small files do not justify a package or a second plugin to keep in sync.

## Twin and status

Twin of kms `docs/decisions/0080-core-is-vendored-by-pin.md`. Draft by an agent; accepting it (owner) means `status: active` and `accepted-by`. Plan: kms `docs/plans/kms-core-and-go-getter-consolidation.md`, step D0.
