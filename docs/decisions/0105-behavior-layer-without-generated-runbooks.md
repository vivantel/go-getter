---
id: 0105-behavior-layer-without-generated-runbooks
title: Behavior is a layer over the four artifact types, with no generated runbook form
status: active
date: 2026-10-10
tags: [knowledge-management, roadmap]
track: product
accepted-by: sergemso
---

## Decision

Supersedes 0104, which committed to compiling derived behavior into runbooks. The runbook spike (`docs/plans/archive/runbook-spike.md`) ended in a no-go on generated runbooks.

- **Kept from 0104:** pure behavior (a modus operandi that names no concrete fact) stays in shipped skills, roles and the instruction file; derived behavior (conduct resting on concrete facts) is what guardrails and procedures already are; facts and decisions are the knowledge they rest on. It is a layer over the four artifact types: no fifth type, no `behaviors/` directory.
- **No generated runbook form.** A runbook is not generated from a guardrail or a procedure, and no committed copy of knowledge is kept for loading on demand. The playbook form (a response to a situation, a diagnosis of symptom, cause and fix) is not built; it is reconsidered only with a real example to compile.
- **Procedures may carry `grounded-in`** (artifact model): a fact, decision or guardrail id its steps rest on, checked by `lint` for dangling references and listed by `go-getter refs`. No new field.

## Why

Measured on three guardrails and two procedures (plan findings): against the guardrail and procedure files an agent reads today the runbooks were 18-57% smaller, but that saving was the frontmatter; against the bodies the guardrail runbooks cost 46-57% more, and the procedure runbooks saved 11% in one case and cost 14% more in the other. Section selectors could not trim the inlined material (24 of 32 facts have no heading; `adding-a-host-agent` used about 313 of the 830 tokens added), a procedure serving several guardrails was copied into each runbook, none of the three guardrail runbooks inlined a fact, and every source correction needed a regeneration commit. The structured link that remained valuable already exists as `grounded-in`; 118 prose citations in `docs/` had none dangling, so a new field and check would have found nothing.

## Tradeoffs considered

- **Go on generated runbooks**: one read instead of several, but more tokens than the cited bodies and a second copy to keep in step.
- **A `uses:` link field with a check**: structured links, but it duplicates `grounded-in` and its change-detection needs a stored baseline, which brings back the regeneration churn.
- **Cost accepted**: a procedure and what it cites are still read separately; the findings (flat facts without headings, fact 0002 doing several jobs) are follow-ups, not part of this decision.
