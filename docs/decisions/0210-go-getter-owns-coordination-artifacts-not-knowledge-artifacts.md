---
id: 0210-go-getter-owns-coordination-artifacts-not-knowledge-artifacts
title: go-getter owns coordination artifacts and the harness, not the knowledge artifacts
status: draft
date: 2026-11-15
tags: [knowledge-base, packaging]
---

## Decision

- kms owns the four durable knowledge artifacts (fact, decision, guardrail, procedure) and their validation. go-getter does not define or validate them.
- go-getter owns coordination artifacts (outcome brief, unit tree, meter, operating charter, harness config) and the harness.
- Both detect and tolerate OpenSpec (0075). Neither copies spec content; a record points at an OpenSpec change with `source`.
- Guardrails that constrain product behaviour stay in scope (enforceable rules, not specs). Requirements, behaviours and acceptance criteria stay out.

## Why

The cut is by artifact ownership: kms owns what outlives the work; go-getter owns what has an owner, state and `Accept`; OpenSpec owns what a change should do.

## Twin and status

Twin of kms `docs/decisions/0069-kms-owns-durable-knowledge-not-specs-or-coordination.md`. Draft by an agent; accepting it (owner) means `status: active` and `accepted-by`. Plan: kms `docs/plans/kms-core-and-go-getter-consolidation.md`, step D0.
