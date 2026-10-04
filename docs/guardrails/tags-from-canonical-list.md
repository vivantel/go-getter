---
id: tags-from-canonical-list
title: Artifact tags must come from docs/skills/tags.md
status: active
date: 2026-10-04
tags: [knowledge-management, guardrail]
governed-by: 0007-kms-artifacts-as-configuration-source-of-truth
grounded-in: [0007-kms-artifacts-as-configuration-source-of-truth]
derivation-note: Given tooling reads artifacts mechanically (0007), near-duplicate tags split one concept into several and break tag-based lookup.
go-getter:
  enforcement:
    - tier: 3
      check: "Every tag on every fact, decision, guardrail and procedure appears in docs/skills/tags.md"
      run: "npm run check:tags"
---

## Guardrail

Every `tags` entry on a fact, decision, guardrail or procedure is on `docs/skills/tags.md`, whoever wrote the file. For a missing concept, add the tag to the list (with a one-line meaning) first; never use a near-duplicate.
