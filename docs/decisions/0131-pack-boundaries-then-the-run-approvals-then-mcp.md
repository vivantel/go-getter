---
id: 0131-pack-boundaries-then-the-run-approvals-then-mcp
title: Work order: pack boundaries, run record and approve-once, MCP governance, go-getter as an MCP server, then helpers
status: active
date: 2026-10-11
tags: [milestones, roadmap, harness]
track: product
accepted-by: sergemso
expires: v0.4.0 is released
---

## Decision

Supersedes 0128 (it put the whole autonomous run build first). The refinements of 0129 and the run contract of 0130 stand.

**Work order, in this sequence:**

1. **L.14 pack boundaries and neutral ids** (#123): split `governance`, neutral provider ids, fold coverage, debugging and review into their owning packs.
2. **Autonomous run, steps 1 and 2** (#126, #127): the run record and approve-once with preconditions. L.11 gates MCP tool calls with this machinery and must not build a second one.
3. **L.11 MCP governance** (#93).
4. **L.12 go-getter as an MCP server** (#94).
5. **L.9 third-party packs and helpers** (#92).

**Then, provisional and in this order:** the rest of the autonomous run (steps 3 to 6, #128 to #131); the retrieval pack (L.15, #124, needs L.11); testing, coverage and debugging in `verification-gate`; host adapters (L.10, #84-#89); cross-plan "what's next" (L.6, #90); then the execution sandbox, release, review, docs and remaining SDLC packs.

This is a work order, not a release scope: v0.4.0 is cut at the owner's call and is expected to carry at least the run record, approve-once and MCP governance. The order after the five numbered items is provisional and is re-evaluated when v0.4.0 ships.

## Why

L.14 first because L.11 and the sandbox would otherwise add questions to a pack that already has fourteen. Steps 1 and 2 of the run build come before L.11 because gating MCP tool calls is the same job as gating outward commands, and it should reuse the approvals and run record. L.12 follows L.11 because it only exposes verbs, and L.9 is last because the helper protocol (0119) is not built until a second implementation, a third party or the trust steps exist, so nothing waits on it.

## Tradeoffs considered

- **The full run build before L.11 (0128's order):** a finished contract sooner, but MCP governance waits on steps that do not feed it.
- **L.11 before any run step:** MCP gating would invent its own approval path.
- **Host adapters before L.11:** fewer per-host branches for L.11 to add, but the owner ranked MCP higher; L.11 will use the adapter inventory (#84) if it exists by then and otherwise records host facts as facts.
- **Cost accepted:** the run contract is usable only partly (record and approve-once) for a while, and the host adapter boundary lags the MCP work.
