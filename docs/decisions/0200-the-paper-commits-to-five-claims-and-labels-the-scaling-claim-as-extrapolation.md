---
id: 0200-the-paper-commits-to-five-claims-and-labels-the-scaling-claim-as-extrapolation
title: The paper commits to five claims and labels the scaling claim as extrapolation
status: active
date: 2026-11-04
tags: [research, positioning, harness, enforcement]
track: product
accepted-by: sergemso
---

## Decision

Accepted by the owner 2026-11-04. The paper (0199) commits to these claims; each is built as a thesis node with premises, objections and defenses in the article repo's theses map.

1. **C1, reliability comes from the edge, not the core.** Guarantees about agent work come from deterministic components around the model (hooks, gates, guardrails, checkpoints, routing), not from making the model deterministic.
2. **C2, determinism is a spectrum, tiered by enforcement.** Guardrails sort into checked by git hooks and CI, blocked by host hooks, and advisory. The paper maps which properties each tier can guarantee and which none can.
3. **C3, humans become orchestrators at the approval boundary.** As agents do the work, the human role shifts to setting outcomes, meters and gates and approving irreversible actions. go-getter is a coordination tool for that role in any domain (0176).
4. **C4, knowledge-as-code is the human-facing contract.** Decisions, facts and guardrails are what humans author and agents obey; the deterministic edge is generated from them.
5. **C5, the claims scale from task to feature, project, product, industry and world system.** This is a **labelled extrapolation**. The case study supports task to product at most; industry and world system are argued from structure only. Each level is its own thesis node with objections and defenses, and the paper says for each level whether evidence or argument supports it.

Agent-drafted thesis nodes are not accepted until the owner accepts them. Further theses may be added through the same process; each is recorded here by superseding or extending this decision.

## Why

The owner wants the paper to carry a post-AI view of human orchestration, not only a description of a tool. One repo cannot evidence industry or world scale, so claiming it at equal weight would read as overreach; labelling it keeps the ambition and the honesty, and the theses map's adversarial lint stress-tests it.
