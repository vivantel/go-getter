---
id: 0198-merge-queue
title: "The merge queue is off: ship merges through it only when it is on"
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  merge-queue: off
  generated-by: orchestration@0.1.5
  pack-answer: merge-queue
  pack-option: off
---

## Decision

The merge queue is off; with it on, `go-getter ship` queues a green change and waits for the merge result instead of merging it (decision 0167 item 3; pack orchestration@0.1.5).

## Why

With many parallel units a serial merge turns every overlap nobody declared into a broken default branch; the queue turns it into a rebase. One person working alone needs no queue.
