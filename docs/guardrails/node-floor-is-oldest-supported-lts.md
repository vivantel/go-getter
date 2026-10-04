---
id: node-floor-is-oldest-supported-lts
title: The Node.js floor must be the oldest LTS line still supported
status: active
date: 2026-10-04
tags: [nodejs, tooling, guardrail]
governed-by: 0019-node-prerequisite-oldest-supported-lts
grounded-in: [0010-nodejs-release-schedule]
derivation-note: Given the floor is defined as the oldest supported LTS (0019) and the official schedule moves lines to end of life (fact 0010), a hard-coded floor goes stale and must be checked against the live schedule.
go-getter:
  enforcement:
    - tier: 3
      check: "engines.node in package.json equals >= the oldest LTS line not past end of life in the official Node.js schedule"
      run: "npm run check:node-floor"
---

## Guardrail

`package.json` `engines.node` and `init`'s Node check use the oldest Node.js LTS line not yet past end of life. When that line reaches end of life, raise the floor and update fact 0010.
