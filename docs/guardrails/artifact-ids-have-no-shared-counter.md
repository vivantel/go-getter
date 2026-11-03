---
id: artifact-ids-have-no-shared-counter
title: A new fact or decision takes a unit-scoped draft id, and index rows are generated
status: draft
date: 2026-11-03
tags: [coordination, knowledge-base, guardrail]
governed-by: 0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units
grounded-in: [0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units, 0041-coordination-hotspots-and-contradictions-in-the-current-design]
derivation-note: Given that parallel units each add artifacts, a shared next-number and four hand-edited index files collide on every pair of them.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; file a new fact or decision as draft-<unit>-<slug> and leave INDEX.md rows to the generator
---

## Guardrail

A new fact or decision is filed as `draft-<unit>-<slug>`; the merge queue assigns its `NNNN`. `INDEX.md` rows are generated from frontmatter and not edited by hand. Advisory (tier 1) until work-coordination K5 and K6 enforce it; until then, and with the queue off, the filing rule of `AGENTS.md` ("next free number", a row per artifact) applies and `check` fails on a duplicate number.
