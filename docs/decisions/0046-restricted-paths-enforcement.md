---
id: 0046-restricted-paths-enforcement
title: Restricted paths are blocked in the host and never committed
status: active
date: 2026-10-05
tags: [practice-packs, governance, enforcement]
track: process
accepted-by: sergemso
go-getter:
  generated-by: governance@0.1.0
  pack-answer: enforcement
  pack-option: hook-and-never-committed
---

## Decision

A host pre-tool hook blocks tool calls that touch a restricted path (tier 2) and CI and pre-push fail if one is tracked (tier 3) (pack governance@0.1.0).

## Why

DLP must not depend on agent compliance (decisions 0009, 0018).
