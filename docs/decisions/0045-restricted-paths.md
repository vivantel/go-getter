---
id: 0045-restricted-paths
title: Restricted data lives at a declared list of paths
status: active
date: 2026-10-05
tags: [practice-packs, governance, security]
track: process
accepted-by: sergemso
go-getter:
  restricted-paths: .env, .env.*, *.pem, *.key, id_rsa, id_ed25519, .go-getter/state/
  generated-by: governance@0.1.0
  pack-answer: restricted-paths
  pack-option: [.env, .env.*, "*.pem", "*.key", id_rsa, id_ed25519, .go-getter/state/]
---

## Decision

The restricted data class is the paths .env, .env.*, *.pem, *.key, id_rsa, id_ed25519, .go-getter/state/ (pack governance@0.1.0). Agents do not read or write them, and only a local model may receive their content.

## Why

DLP needs a declared list that hooks and CI can enforce (decision 0018).
