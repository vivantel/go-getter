---
id: 0141-mcp-no-project-policy
title: No project list of MCP servers
status: draft
date: 2026-10-12
tags: [practice-packs, hooks]
track: process
go-getter:
  generated-by: hitl@0.6.0
  pack-answer: mcp-policy
  pack-option: off
---

## Decision

The project sets no list of MCP servers; the host's own settings decide which servers agents use (pack hitl@0.6.0).

## Why

The project accepted the host's defaults for less setup (decision 0138); choosing `allowlist` makes the pre-tool hook deny unlisted servers.
