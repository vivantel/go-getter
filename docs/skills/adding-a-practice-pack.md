---
id: adding-a-practice-pack
title: Procedure for adding a practice pack
status: active
date: 2026-10-04
tags: [practice-packs, interview, dogfooding, procedural]
---

## Procedure

1. **Scope the practice area** and choose its family: a *harness* pack (list the `components` of fact 0002 it covers) or an *SDLC* pack (list the harness packs it `requires`). Check existing packs and decisions for overlap; extend rather than duplicate.
2. **Write `src/packs/<pack-id>/pack.json`** against the pack schema: one decision per question. `choice` questions: each option has a tradeoff and exactly one is recommended. `text`/`list` questions (project-specific values such as paths or commands): give a `default` or a `detect` key, and a `pattern` when the value has a shape. Use `{{detect.<key>}}` wherever a fact can be looked up instead of asked. Outputs of a `text`/`list` question sit under the key `*`, since they apply whatever the answer is.
3. **Declare outputs per answer**: the knowledge-base artifact templates (decision, guardrail, procedure, fact), each guardrail's `go-getter.enforcement` entries (tiers 1-3), structured data under `go-getter:`, and any compiled host output. Emitted artifacts carry `go-getter.generated-by` and `go-getter.pack-answer`.
4. **Validate**: `npm run check:packs`. Add a golden fixture of the artifacts the recommended-defaults path produces.
5. **Adopt it in this repo** by running `init` for the pack here; commit the resulting artifacts. A pack is not releasable before this (`practice-ships-only-after-self-adoption`).
6. **Add an eval case** running the interview against a fixture repo.
7. **Record the pack in a decision** if it commits go-getter to a new practice area.
