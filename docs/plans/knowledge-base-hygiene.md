# Knowledge-base hygiene — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-11-04 from an audit of the 165 decisions (read-only, three agents; tables kept by the owner, not in git). Goal: the decision list holds choices, not settings, so an agent that reads it pays tokens only for what could be decided differently. Decision 0185 (draft) fixes the design; read it first, then `docs/skills/adding-a-practice-pack.md` and guardrails `owned-files-never-clobbered`, `generated-host-files-not-hand-edited`, `guardrails-declare-enforcement`.

## Phase 1 — Answers as data

### Q1 Accept the design — [ ]
Class: plan · Needs: none · Human: the owner accepts, amends or rejects draft decision 0185 (an `active` decision also gets `accepted-by`) · Check: `npm run check:guardrails && npm run check:plans`
Do: take the owner's answer on 0185; if accepted, set it `active` with `accepted-by`.
Done-when: 0185 is `active` or rejected, and the result line says which.

### Q2 Record an answer without a decision — [ ]
Class: implement · Effort: high · Needs: Q1 · Check: `node --test compiler/test/pack-answers-roundtrip.test.mjs compiler/test/pack-renamed.test.mjs && npm run check:generated`
Context: `compiler/src/render.mjs`, `update.mjs` and `reconfigure.mjs` read the stored answer from the rendered decision's `go-getter.pack-answer` and `pack-option`; the round-trip test fails for a question with no decision. Packs: `src/packs/*/pack.json`.
Do: store each answer in the project's answers record; add `decision: true|false` to the pack schema (default `false`); have `render-pack`, `update` and `reconfigure` read the record first and fall back to a decision's frontmatter for projects not yet migrated; emit a decision only for `decision: true`. Mark the packs' real-choice questions `decision: true` using the ADR test of 0185 item 2. Update `adding-a-practice-pack.md`.
Done-when: tests show a pack rendered with no decision files for `decision: false` questions, `update` re-rendering from the record, an old project (decisions only) still updating, golden files changed only by the removed decisions, and `go-getter apply --check` clean.

### Q3 Migrate this repository's rendered decisions — [ ]
Class: implement · Effort: medium · Needs: Q2 · Check: `npm run check:guardrails && npm run check:plans && npm run check:generated`
Do: for each decision with `pack-answer` and no listed alternatives, move its answer into the record, archive the file under `docs/decisions/archive/`, and keep a one-line pointer in `INDEX.md`; leave any decision that guardrails, skills or code cite until the citation points at the pack and option. Run `go-getter:lint` and `go-getter apply`.
Done-when: no active decision has `pack-answer` without `decision: true`, lint reports no dangling reference, and `apply --check` is clean.

## Phase 2 — Review the authored decisions

### Q4 Read each remaining decision in full — [ ] ‖
Class: review · Needs: Q3 · Human: the owner approves the list before any file moves · Check: `go-getter:lint`
Do: for each remaining decision, read the Tradeoffs section in full and sort it: keep (costly to reverse, real alternatives, a later agent could choose differently), fact, fold into a skill or guardrail, archive, or supersede. The 2026-11-04 audit is a guide only: about 6 of 16 of its FOLD and ARCHIVE verdicts that were checked in full were wrong. Present the list; move files in batches after approval, with a pointer in `INDEX.md`.
Done-when: the list is approved, each batch's lint passes, and `INDEX.md` is smaller by the archived rows.
