---
id: 0155-human-attention-goes-to-plan-approval-triggers-and-batched-releases
title: Human attention goes to plan approval, four ask-triggers and batched releases; agents merge on green and log defaulted decisions
status: active
date: 2026-11-01
tags: [hooks, roadmap, agent-roles]
track: process
accepted-by: sergemso
---

## Decision

1. **Plan approval once.** The owner approves a plan (scope, decisions, done-when checks) once; an autonomous run (0130) then implements, reviews, opens PRs, watches CI and squash-merges on green without further prompts.
2. **Release in batches.** A release is a human-approved gated action (0094), taken as a batch (default daily), not per merge.
3. **Default and log.** When a decision arises mid-plan, the agent takes the recommended default, records it as a `draft` decision or fact, and continues. It stops and asks only on a trigger: (a) hard to reverse, (b) changes a committed decision, (c) data-class or security impact, (d) spend above the run budget.
4. **One digest.** The owner reviews the logged defaults and flagged items in one sitting (procedure `reviewing-the-daily-digest`).

It extends 0130 (autonomous run) and leaves 0094 (gated actions need a human) intact; merge-on-green is allowed because the gate stack of 0158 replaces per-PR approval.

## Why

Fact 0040: most owner turns carried no information ("2", "y", "whats next", "merge, watch, release"). The recommended default was almost always taken, so asking each time buys little; the four triggers keep the choices that are the owner's.
