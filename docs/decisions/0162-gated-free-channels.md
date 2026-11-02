---
id: 0162-gated-free-channels
title: Release and publish channels that run without asking are listed
status: draft
date: 2026-11-02
tags: [practice-packs, hooks]
track: process
go-getter:
  generated-by: hitl@0.7.0
  pack-answer: free-channels
  pack-option: []
---

## Decision

A release or publish to the channels [] runs without a human (pack hitl@0.7.0); an empty list frees none. A channel not listed is production and still needs a human, as does a repository settings change. Creating a tag never asks.

## Why

A pre-release or a non-default dist-tag does not reach the users of the production channel, so asking for each one adds friction without protection; production keeps its human (decision 0159 item 2).
