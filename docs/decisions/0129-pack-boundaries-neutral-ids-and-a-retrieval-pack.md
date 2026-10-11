---
id: 0129-pack-boundaries-neutral-ids-and-a-retrieval-pack
title: Each concern has one pack, provider ids are neutral, and memory beyond the knowledge base is a provider-neutral retrieval pack
status: active
date: 2026-10-11
tags: [practice-packs, roadmap, architecture]
track: product
accepted-by: sergemso
---

## Decision

Refines the v0.4 and later scope of 0128 after a review of the packs for overlap, domain coupling and fit with virage (github.com/vivantel/virage).

1. **One concern, one pack.** Planned work extends the pack that already owns the concern instead of adding a second one:
   - Coverage and debugging extend `verification-gate` (it already owns the test commands); release extends its release gate.
   - Review has one owner. `verification-gate` keeps the review bar; `orchestration` keeps only the reviewer role, and the planned review pack is not created unless a gap remains.
   - The autonomous run contract (L.8) is a **profile**: a named set of answers over `hitl`, `cost-routing` and `orchestration` plus the run rules it adds, not a pack that restates their questions.
2. **`governance` splits** before the MCP work (L.11) and the sandbox build on it: path restrictions and secret use, sanitization (scan, masking), and data policy (internal data, provider, zero data retention, prompt logging) become separate packs with migrated answers. Existing answer files keep rendering.
3. **Provider ids are neutral.** The gated-command catalog names the action (`pr-create`, `pr-merge`, `pr-close`) and each provider (GitHub first) supplies its command patterns; `gh-pr-*` ids keep working as aliases. Harness packs stay domain-neutral; software practice packs (git workflow, tracker, testing, release) are named and documented as practice packs.
4. **Memory beyond the knowledge base is a `retrieval` pack** with a provider-neutral question (`none | virage | other`), virage first and recommended. It generates only configuration: the MCP server entry, the indexing hook, an instruction snippet, and the knowledge base as an indexed file set. Three rules bind it:
   - Restricted paths feed the index's ignore list, secrets are scanned before indexing, and a hosted embedder is refused when the project's data is internal, because a retrieved chunk bypasses path denial.
   - Its tool calls and output are governed by L.11, so it ships after that.
   - go-getter detects a retrieval tool and lets its writes to host files coexist with go-getter's markers (as 0075 does for spec tools); it never loads the tool's code (0119). The pack ships only after this repository adopts it (guardrail `practice-ships-only-after-self-adoption`).

## Why

A review found three packs asking about review, two about `Refs:`, one pack carrying three concerns in fourteen questions, and a catalog that only knows GitHub. Fixing the boundaries before more packs build on them is cheaper than after. Virage is the owner's own retrieval pipeline, with an MCP server and agent plugins of its own, so it fits the memory item of 0128, and the governance risk (an index re-exposing denied content) is what makes it belong under go-getter.

## Tradeoffs considered

- **A virage-specific pack**: simplest, but ties a general framework to one product and repeats for the next retrieval tool.
- **A new pack for each planned practice**: matches the backlog wording, but duplicates questions already in `verification-gate` and `orchestration`.
- **Leaving `governance` whole**: no migration, but every addition (MCP, sandbox) lands in a pack already at fourteen questions.
- **Cost accepted**: a migration of answer files and decisions for the split, and virage's tool names and hook behaviour are not yet confirmed (a fact must record them before the pack is built).
