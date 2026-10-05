---
id: 0047-internal-data-routing
title: Internal data goes only to approved cloud providers on paid no-training terms
status: active
date: 2026-10-05
tags: [practice-packs, governance, model-routing]
track: process
accepted-by: sergemso
go-getter:
  model-registry:
    internal: approved-cloud
    providers:
      - id: anthropic
        terms: paid-no-training
        zdr: false
      - id: openai
        terms: paid-no-training
        zdr: false
      - id: google
        terms: paid-no-training
        zdr: false
  generated-by: governance@0.1.0
  pack-answer: internal-data
  pack-option: approved-cloud
---

## Decision

Internal data may go to local models and to anthropic, openai and google on their paid API tiers. (pack governance@0.1.0).

Providers count as approved only on their paid API tier; free tiers may train on content. Routing removes every model of another provider before it compares cost (guardrail routing-governance-before-cost). Add providers or local models by a new decision or a fact carrying `go-getter.models`.

## Why

Routing for cost must never move data outside the boundary its class allows (decision 0018).
