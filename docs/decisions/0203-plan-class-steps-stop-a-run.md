---
id: 0203-plan-class-steps-stop-a-run
title: "A Class: plan step stops an autonomous run for a person"
status: active
date: 2026-11-05
tags: [roadmap, enforcement]
track: product
accepted-by: sergemso
---

## Decision

An autonomous run stops with `human-needed` at any plan step of `Class: plan`, whether or not it carries `Human:`, and never offers one as a parallel step. This reads item 6 of 0130 (a step that needs a human) to include a design step, whose answer is the owner's sign-off.

## Why

A plan-class step produces a decision or a design, which a run cannot accept for the owner; skipping or guessing it would break "never skips such a step silently".

Refs: 0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops
