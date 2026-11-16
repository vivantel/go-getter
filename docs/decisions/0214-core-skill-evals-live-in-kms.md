---
id: 0214-core-skill-evals-live-in-kms
title: Core skill evals stay in kms; go-getter runs the conformance fixtures and its own harness evals
status: active
accepted-by: sergemso
date: 2026-11-15
tags: [eval, knowledge-base]
---

## Decision

go-getter's `eval` runs only harness behaviour and the kms conformance fixtures against its vendored checker. The skill evals for knowledge-artifact behaviour run in kms. Both repos pin one promptfoo version.

## Why

The same behaviour must not be measured twice with two harnesses.

## Twin and status

Twin of kms `docs/decisions/0082-core-evals-live-in-kms.md`. Accepted 2026-11-16 by the owner. Plan: kms `docs/plans/kms-core-and-go-getter-consolidation.md`, step D0.
