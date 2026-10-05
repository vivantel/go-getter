---
id: 0024-dogfood-workflow-with-own-plugin
title: This repo runs its knowledge-base workflow through its own go-getter plugin, with capture, conform and attribute on every PR
status: active
date: 2026-10-05
tags: [dogfooding, knowledge-management, git-hooks]
track: process
accepted-by: sergemso
---

## Decision

- Contributors' sessions in this repo use the knowledge-base skills shipped inside go-getter's own plugin (`go-getter:*`), not a standalone install of them, so every session exercises the packaging that ships.
- Before every PR: `capture`, `conform`, then `attribute` for the commit message and PR description. At each plan phase boundary: `lint`. At each release: `changelog`.
- `apply` installs the capture and lint nudges as session-start hooks.
- Commit subjects are Conventional Commits, enforced by guardrail `commit-subjects-are-conventional`.
- Commits and PRs carry no AI-tool attribution lines (owner instruction, 2026-10-05).

## Why

The self-hosting ratchet (0010) covered go-getter's own guardrails but not the knowledge-base workflow it ships; until now capture, conform and lint were followed by hand or not at all.

## Tradeoffs considered

- **Keep a standalone install of the skills**: identical skills today, but sessions would stop testing go-getter's packaging and would drift once upstream moves past the vendored pin.
- **Automate capture/conform as blocking hooks**: they are agent-judgment skills, not deterministic checks, so they stay a per-PR checklist (tier 1) with session-start nudges.
