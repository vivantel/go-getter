---
id: 0189-claim-lease-agent
title: The lease of an agent's claim is 60 minutes
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  lease-agent: "60"
  generated-by: orchestration@0.1.3
  pack-answer: lease-agent
  pack-option: "60"
---

## Decision

The lease of an agent's claim is 60 minutes (decision 0166; pack orchestration@0.1.3).

## Why

An agent that stops without releasing must free its unit soon, and renewal by heartbeat keeps a live agent from losing it; an hour is long enough to ride out a slow step and short enough that a lost agent blocks others for little time.
