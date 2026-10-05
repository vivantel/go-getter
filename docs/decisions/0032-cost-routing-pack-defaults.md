---
id: 0032-cost-routing-pack-defaults
title: The cost-routing pack recommends five task classes, balanced tiers, two escalations, a $5 headless cap and 1h main-session cache
status: active
date: 2026-10-05
tags: [practice-packs, model-routing, cost]
track: product
accepted-by: sergemso
---

## Decision

The `cost-routing` harness pack (component 11, decisions 0016, 0020) recommends:

1. Task classes: **explore, plan, implement, review, debug**, matching the orchestration roles (alternatives fast/strong, per-role only).
2. Starting tiers: **balanced** — explore small, implement medium, plan/review/debug large, each at the lowest effort its class allows (alternatives quality-first, cost-first).
3. Stay in session vs delegate: **cost model decides** (shared with the context pack, 0027).
4. Maximum escalations per step: **2**, then a human.
5. Headless spend cap where hosts support one: **$5 per run**.
6. Prompt-cache lifetime where hosts allow it: **1 hour for the main session, 5 minutes for subagents**.

## Why

Balanced tiers spend on the classes where quality matters most; a 1-hour main-session cache pays off after two reads and survives pauses (fact 0011).

## Tradeoffs considered

- **Quality-first / cost-first**: fewer escalations at higher spend, or lower spend with more retries.
- **5-minute cache everywhere**: cheaper writes, full re-reads after every pause.
