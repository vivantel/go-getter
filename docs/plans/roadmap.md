# Roadmap — product index

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Rewritten 2026-11-03 from the single 2026-11-01 roadmap. go-getter is reframed as a task-solving framework for humans and agents working many units in parallel (decisions 0165-0175). The product is a tree of **work units** (product > feature > plan > step, one contract at every level, 0165); a **feature** below is one plan file; a **plan** is the default unit of delegation. This file is the product-level index: it holds no step state beyond the two retrieval steps below. Read first: fact `docs/facts/0041-coordination-hotspots-and-contradictions-in-the-current-design.md`.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`; at each plan boundary run `go-getter:lint`. Read the guardrails a step governs before changing code: `no-runtime-dependencies`, `owned-files-never-clobbered`, `generated-host-files-not-hand-edited`, `neutral-source-has-no-host-specific-language`, `telemetry-records-metadata-only`, `restricted-paths-denied`.

## Features (one plan file each)

| Feature | Plan | Order | Notes |
|---|---|---|---|
| Work-unit coordination (claims, scope, merge queue, parked asks, grants, validation, lifecycle, soak test) | `work-coordination.md` | core slice (K1-K7, K9) in parallel with the rest; K20 dogfoods the core | New. Decision 0182: T4, T8, T9 and G5 are built first on today's layer and K11 migrates them later. |
| Discovery and outcomes (outcome brief, meters, effects, capability tags, `/discover`) | `discovery-and-outcomes.md` | D2, D3, D7, D7a, D8 independent; D4-D6 blocked on `work-coordination.md` K9/K10, K8 and K3 | New. Decision 0176 widens the scope beyond software; D4, D5 and D6 extend K10, K8 and K1/K3. |
| Automation-first gates | `automation-first-gates.md` | G4, G5 independent; G6 after G5 | G1-G3, G7, G8 done. |
| Throughput: human minutes per merged outcome | `throughput.md` | T2, T5, T8, T9 independent; T4 after H2; T10 after T4, T5, T8, T9 (run it before the K plan finishes) | T1, T3, T6, T7 done or merged. |
| Host adapter boundary | `host-adapters.md` | independent | H2 first; it unblocks T4. |
| go-getter as an MCP server | `mcp-server.md` | independent | M2 first. |
| Work-source budgets | `worksource-budgets.md` | independent, before K2 where possible | K2 and K3 read work sources through `callSource`, so W1's budgets should land first. |
| Runs, spend and install | `runs-spend-install.md` | independent | Review R1 against K9 (lifecycle) when K9 starts. |
| Knowledge-base hygiene (pack answers as data, review of authored decisions) | `knowledge-base-hygiene.md` | Q1 first | New (0185, draft). Q2 and Q3 change the pack renderer and golden files; independent of the other plans. |
| Retrieval pack (two live steps) | this file, below | external | Waits for virage. |

Dogfood order (decision 0182; R4 first, because a run cannot start from the agent until it lands): T2, P1, T5, R1, H2, G4, G5 first; then T4, T8, T9; then T10; the K core runs alongside and K20 measures it. Independent features run in parallel from now. No cross-feature dependency is encoded beyond the "Order" column until K1 makes `plan#id` parse.

## In flight at the split (2026-11-03, from the former status board)

These carry over unchanged; branch and worktree are in each step's `Progress` line in its feature plan: T2 dogfood install (`[~]`, `throughput.md`), P1 allow rules and S1 install smoke test (`[~]`, `runs-spend-install.md`), V2 virage conforms (`[~]`, below). The interview follow-ups #233-#237 (branch `feat/pack-tiers-and-profiles`) belong to no plan here: land or rebase them.

## Held (not steps; each waits for something outside the plan)

- **Retrieval pack** (#214 skeleton and MCP entry, #215 injection hook, #216 index governance, #218 adopt): decision 0145 holds the whole pack until a virage release conforms (V2). Plan text is in `docs/plans/archive/retrieval-pack.md`, steps 3, 4, 5, 7; move them back here when V2 is done.
- **Foreign packs** (#184 manifest entry, digest and vendoring; #185 content rule; #186 author guide; #187 adopt): decision 0142 waits for someone who asks to write a pack. Plan text is in `docs/plans/archive/third-party-packs.md`, steps 3 to 6. Budgets (W1, W2) are not held.
- **Helper protocol** (#189): waits for a second implementation of a kind or a third party who asks (0142). Text in `docs/plans/archive/backlog.md`, L.18.
- **Start a run by confirmation** (#166): moved on 2026-11-04 into `docs/plans/runs-spend-install.md` step R4, widened: remove the human-only start and take authority from the approved plan (a human-only start serializes every actor and blocks the dogfood chain). Text in `docs/plans/archive/backlog.md`, L.16.


---

## Phase 6 — Retrieval pack, the two live steps

The pack waits for virage (see Held); these two steps run now. Facts and decisions first: `docs/facts/0038-virage-integration-surface.md` and `docs/decisions/0145-retrieval-tools-follow-a-go-getter-contract.md`.

### V2 Virage conforms — [~]
Issue: #213
Class: plan · Needs: none · Human: the changes are made in the virage repository (the owner's); this repository waits for a release · Check: `npm run check:plans`
Do: track the virage issues vivantel/virage#435 (conformance mode and declaration), #436 (read the index policy), #437 (pre-index secret scan), #438 (warm loopback endpoint) and #439 (uninstall cleanup). Record here the release that meets them; then move the held retrieval steps back into this plan.
Done-when: this step's result line names the release that conforms.

### V6 Decide whether to reverse the hold on an earlier retrieval slice — [ ]
Issue: #217
Class: plan · Needs: none · Human: the owner has not decided (2026-10-12: "need to consult"); reversing needs a superseding decision of item 3 of 0145 · Check: `npm run check:plans`
Do: take the owner's answer on whether a slice ships before virage conforms. Candidates: `detect` reporting virage; a prefill of `mcp-servers` with `virage` and a note that every virage tool counts as write; a `coverage` line that a retrieval tool's own prompt hook injects chunks outside tool-call governance. If a slice should ship earlier, supersede item 3 of 0145 and add one step per slice with its done-when; if not, mark this step done with that result.
Done-when: the result line records the owner's answer and any added steps.
