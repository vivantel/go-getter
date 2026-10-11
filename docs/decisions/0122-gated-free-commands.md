---
id: 0122-gated-free-commands
title: Outward-facing commands that run without asking are listed
status: active
date: 2026-10-11
tags: [practice-packs, hooks]
track: process
accepted-by: sergemso
go-getter:
  generated-by: hitl@0.3.0
  pack-answer: free-commands
  pack-option: [git-push]
---

## Decision

The commands [git-push] run without a human, though they are outward-facing (pack hitl@0.3.0); an empty list frees none. Irreversible commands and every other outward-facing command still need a human.

## Why

A plain push to a feature branch is reversible, and a push to the default branch is stopped by a git hook or branch protection, so asking for each one adds friction without protection (decision 0120).
