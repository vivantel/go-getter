---
id: 0021-governance-data-and-eligibility
title: Governance decisions carry the registry and class policy that eligibility reads; the single-provider answer adds a provider question
status: active
date: 2026-10-05
tags: [governance, model-routing, practice-packs]
kind: decision
governed-by: 0018-data-classes-constrain-routing-with-tiered-dlp
---

- Registry: `go-getter.model-registry.providers` (approved providers) in the internal-data decision, joined by `routing/registry.mjs` with models from active facts carrying `go-getter.models` (`local: true` marks a local model); confidential policy is `go-getter.data-classes.confidential` (`enabled`, `requires-zdr`).
- `routing/eligibility.mjs`: public → any model; internal → local or approved-provider; confidential → the internal set, narrowed to providers recorded `zdr: true` when required, and treated as restricted when the class is disabled; restricted → local only; unknown class or missing registry → fail closed; empty set → human.
- No pack records a provider with `zdr: true`, so requiring zero data retention leaves confidential steps to local models or a human until a decision records one.
- The pack adds a `provider` question, asked only for the single-provider answer, since 0029 names the alternative without saying which provider.
