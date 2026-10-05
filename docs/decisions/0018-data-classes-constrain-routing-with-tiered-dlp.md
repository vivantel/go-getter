---
id: 0018-data-classes-constrain-routing-with-tiered-dlp
title: Data classes are hard constraints on model eligibility, enforced with tiered DLP
status: active
date: 2026-10-04
tags: [governance, security, model-routing, harness]
track: product
accepted-by: sergemso
---

## Decision

The governance harness pack (guardrails & safety, component 7) provides:

- **Data classes** defined by path/pattern — default public / internal / confidential / restricted, customizable.
- **An approved-model registry**: provider, model, endpoint, region, data-retention / zero-data-retention terms, local vs. cloud, and the data classes each entry may receive. Local endpoints (e.g. self-hosted models) are registered where a host can use them.
- **Eligibility before cost**: routing (0016) filters to models the step's data class allows before any cost comparison; with no eligible model, the step goes to a human.
- **Tiered DLP** (0009): tier 2 host hooks/permissions block restricted paths and secrets from reaching ineligible models, with tool-output redaction where supported; tier 3 secret scanning in git hooks and CI; an audit trail via metadata-only telemetry.

Classes and registry are knowledge-base artifacts with data under `go-getter:` (0007).

## Why

The user requires DLP and governance of local vs. cloud LLM usage; routing for cost must never become a channel for data leaving its allowed boundary.

## Tradeoffs considered

- **Policy document + advisory instructions**: fast, but DLP that relies on agent compliance is not DLP.
- **Binary local-only / cloud-allowed switch**: simple and strong when local-only, but no middle ground for mixed-sensitivity repos and no routing flexibility.
- **Cost accepted**: hosts differ in what they can block; where a host cannot enforce a class, that host is reported as advisory for it, and the project may restrict which hosts may touch restricted data.
