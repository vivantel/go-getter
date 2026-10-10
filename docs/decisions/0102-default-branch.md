---
id: 0102-default-branch
title: The default branch takes no direct work
status: active
date: 2026-10-10
tags: [practice-packs, git-hooks, guardrail]
track: process
accepted-by: sergemso
go-getter:
  generated-by: git-workflow@0.1.0
  pack-answer: default-branch
  pack-option: protect
---

## Decision

A git hook and CI refuse a commit or push while the default branch is checked out, and agents are told the same (pack git-workflow@0.1.0).

## Why

Every change goes through a branch and a pull request, so review and CI see it before the default branch does.
