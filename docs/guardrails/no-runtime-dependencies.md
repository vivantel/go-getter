---
id: no-runtime-dependencies
title: go-getter must have no runtime dependencies
status: active
date: 2026-10-04
tags: [nodejs, tooling, guardrail]
governed-by: 0019-node-prerequisite-oldest-supported-lts
grounded-in: [0019-node-prerequisite-oldest-supported-lts]
derivation-note: Given zero-dependency Node tooling (0019), any entry under `dependencies` would require an install step in adopting projects.
go-getter:
  enforcement:
    - tier: 3
      check: "package.json has no dependencies (devDependencies allowed)"
      run: "npm run check:deps"
---

## Guardrail

Do not add to `dependencies` in `package.json`. Dev-only tooling goes in `devDependencies` and must not be needed to run the compiler, hooks or tier-3 checks.
