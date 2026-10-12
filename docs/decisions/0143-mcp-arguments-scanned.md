---
id: 0143-mcp-arguments-scanned
title: MCP call arguments are scanned for secrets
status: draft
date: 2026-10-12
tags: [practice-packs, hooks]
track: process
go-getter:
  generated-by: sanitization@0.7.0
  pack-answer: mcp-argument-scan
  pack-option: on
---

## Decision

A call to an MCP server whose arguments contain a secret is refused before it leaves, naming the kind of secret and never its text (pack sanitization@0.7.0).

## Why

An MCP server is third-party code; a secret in a tool call would leave the project with it (decision 0138).
