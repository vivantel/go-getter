---
id: 0104-behavior-is-a-layer-over-knowledge-artifacts
title: Behavior is a layer over the four artifact types, split into pure and derived, and derived forms are compiled from knowledge
status: superseded
superseded-by: 0105-behavior-layer-without-generated-runbooks
date: 2026-10-10
tags: [knowledge-management, generated-files, roadmap]
track: product
accepted-by: sergemso
---

## Decision

Implements the "behavior" question of backlog item L.3 (0068). It adds no artifact type and no directory.

- **Pure behavior** is a modus operandi that names no concrete fact (verify before declaring done; interview one question at a time). It stays in shipped skills, roles and the instruction file.
- **Derived behavior** is conduct that rests on concrete facts and constraints. A guardrail (the norm) and a procedure (the steps) already are derived behavior; a **runbook** is a further form: one on-demand skill per guardrail that inlines the norm, the steps of the procedures that `operationalize` it and the facts it is grounded in.
- **Knowledge** (facts and decisions) is the source. Derived forms are generated from it and from each other, never edited by hand once generated; a drift check fails when a source changed and the form did not.
- The playbook form (a response to a situation spanning several guardrails) is named but not built; it is defined only if the runbook spike shows it is distinct.

The runbook spike (`docs/plans/runbook-spike.md`) ends with a go or no-go decision; nothing ships to adopters before it.

## Why

The word "behavior" had no definition, and the compile-a-runbook proposal needs one to say what is compiled from what. Guardrails, procedures and facts are each read separately today; the layer names what they have in common without restructuring the artifact model, its INDEX handling or the packs that emit guardrails and procedures.

## Tradeoffs considered

- **A fifth artifact type (`behaviors/`)**: one model for pure and derived behavior, but it rewrites the artifact model, lint and every pack that emits guardrails or procedures.
- **A type for pure behavior only**: governs project-level modus operandi like a decision, but overlaps with skills and roles.
- **Cost accepted**: pure behavior stays ungoverned by the knowledge base; it is versioned only as shipped skills and roles.
