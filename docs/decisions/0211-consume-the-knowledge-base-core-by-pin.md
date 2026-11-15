---
id: 0211-consume-the-knowledge-base-core-by-pin
title: go-getter consumes the knowledge-base core by pinned schema version; it ships no fork
status: draft
date: 2026-11-15
tags: [knowledge-base, packaging, vendoring]
track: process
---

## Decision

The artifact model, structural checker and conformance fixtures are defined once, in kms, and versioned by a schema version. go-getter vendors them at a pinned kms release tag and does not edit them. Its own additions (the `go-getter:` key, draft ids, plan and harness checks) live in separate files and checks that run after the core. Until the owner accepts this draft, 0066 stays active and nothing is deleted.

## Why

The two models were measured in kms plan step A1: 9 identical items, 2 conflicting, so alignment is a cleanup, and the forks have drifted since 2026-10.

## Twin and status

Twin of kms `docs/decisions/0070-kms-is-the-knowledge-base-core-consumed-by-pin.md`. Supersedes 0066 once accepted. Draft by an agent; accepting it (owner) means `status: active` and `accepted-by`. Plan: kms `docs/plans/kms-core-and-go-getter-consolidation.md`, step D0.
