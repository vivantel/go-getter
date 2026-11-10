---
id: restricted-data-hosts-rule
title: Restricted data is handled only on hosts with a blocking pre-tool hook
status: active
date: 2026-10-11
tags: [practice-packs, governance, guardrail]
governed-by: 0050-restricted-data-hosts
grounded-in: [0050-restricted-data-hosts]
derivation-note: Given DLP must not depend on agent compliance (0018), only hosts whose hook can block may be near restricted data.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction; the coverage report shows the tier per host
    - tier: 3
      check: Every host agent configured in the project declares a blocking pre-tool hook in its capability file and has go-getter's pre-tool hook installed in the hook file that names
      run: builtin:hosts-block-pre-tool
      origin: derived
  generated-by: restricted-data@0.6.0
  pack-answer: restricted-hosts
  pack-option: hook-hosts
---

## Guardrail

Handle restricted data only in host agents with a blocking pre-tool hook. Git hooks and CI fail when a host configured in the project declares no blocking pre-tool hook (tier 3). Advisory (tier 1) for the choice of host a person works in: `go-getter coverage` shows where DLP is only advisory.
