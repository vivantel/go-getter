---
id: 0219-pool-base
title: Pool slots start from `master`
status: active
date: 2026-11-22
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  pool-base: master
  generated-by: orchestration@0.1.6
  pack-answer: pool-base
  pack-option: master
---

## Decision

A free slot sits detached on `master` (`default` is the repository default branch) and a branch is merged when its work is in it. (pack orchestration@0.1.6).

## Why

A project that integrates on a branch other than the default needs slots to track that branch.
