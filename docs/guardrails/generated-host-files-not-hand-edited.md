---
id: generated-host-files-not-hand-edited
title: Generated host-agent files must never be hand-edited
status: active
date: 2026-10-04
tags: [generated-files, compiler, guardrail]
governed-by: 0005-neutral-source-compiler-architecture
grounded-in: [0005-neutral-source-compiler-architecture]
derivation-note: Given 0005 (neutral source is the only authored form, outputs are committed), any hand edit to an output is lost or causes drift, so outputs must change only by recompiling.
go-getter:
  enforcement:
    - tier: 3
      check: "Regenerating all host output yields no diff against the committed files"
      run: "npm run check:generated"
---

## Guardrail

Edit the neutral source, then recompile. Never edit compiler output (including symlink targets) by hand.
