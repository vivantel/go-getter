---
id: a-claim-names-its-holder
title: A claim names its holder, and the holder is the author of the unit's commits
status: draft
date: 2026-11-03
tags: [coordination, security, guardrail]
governed-by: 0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker
grounded-in: [0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker, 0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author]
derivation-note: Given that acceptance depends on the validator differing from the author, the claim must say who the author is.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; a claim records kind and id of its holder
---

## Guardrail

Every claim records its holder's kind (human, agent or ci) and id. A claim whose holder does not match the author of the unit's commits is flagged at `ship`. Advisory (tier 1) until work-coordination K16 adds the check.
