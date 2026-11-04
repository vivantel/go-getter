---
id: 0190-claim-lease-ci
title: The lease of a CI job's claim is 60 minutes
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  lease-ci: "60"
  generated-by: orchestration@0.1.3
  pack-answer: lease-ci
  pack-option: "60"
---

## Decision

The lease of a CI job's claim is 60 minutes (decision 0166; pack orchestration@0.1.3).

## Why

A claim must expire so a lost worker frees its unit, and the margins keep clock differences from taking a live claim.
