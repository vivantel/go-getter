---
id: 0193-claim-parent-idle
title: A parent unit with live children is flagged idle after 7 days without action
status: draft
date: 2026-11-04
tags: [practice-packs, agent-roles, harness]
track: process
go-getter:
  parent-idle: "7"
  generated-by: orchestration@0.1.3
  pack-answer: parent-idle
  pack-option: "7"
---

## Decision

A parent unit with live children is flagged idle after 7 days without action (decision 0166; pack orchestration@0.1.3).

## Why

A parent with live children holds no lease, so nothing else would show that nobody is working on it; the idle period flags it for a person or K7 to park, and a week keeps a normal pause from raising a flag.
