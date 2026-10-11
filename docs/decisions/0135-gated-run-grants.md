---
id: 0135-gated-run-grants
title: Outward commands a run or a remembered approval may allow are listed
status: draft
date: 2026-10-11
tags: [practice-packs, hooks]
track: process
go-getter:
  run-grants: git-push, pr-create, pr-merge, pr-close
  generated-by: hitl@0.5.0
  pack-answer: run-grants
  pack-option: [git-push, pr-create, pr-merge, pr-close]
---

## Decision

The outward commands [git-push, pr-create, pr-merge, pr-close] may run without a prompt when an autonomous run grants them or a person approved them once, and only while their preconditions hold at that use (pack hitl@0.5.0); an empty list grants none. Tags, releases, publishing and history rewrites always need a human.

## Why

Confirming each merge of a plan whose order is fixed is friction without protection when required checks and branch protection already bound the work; the preconditions keep a remembered approval from outliving the conditions that made it safe (decision 0130).
