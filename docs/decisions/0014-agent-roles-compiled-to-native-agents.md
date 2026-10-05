---
id: 0014-agent-roles-compiled-to-native-agents
title: Agent roles are declared once and compiled to native host agents' subagents with a shared handoff contract
status: active
date: 2026-10-04
tags: [agent-roles, compiler, practice-packs, harness]
track: product
accepted-by: sergemso
---

## Decision

Agent roles & responsibilities are declared once in the orchestration harness pack (multi-agent orchestration, component 10): each role has a scope, allowed tools/paths, forbidden actions, a default routing task class (0016), and a shared handoff and escalation contract. The compiler (0005) emits native subagent/agent definitions — including per-agent model and effort settings from the routing policy — where a host has them, and an equivalent rules section where it does not. The roster chosen by a project is recorded as knowledge-base decisions (0007).

## Why

Roles enforced through native tool and path limits are real guardrails, support genuine parallel multi-agent work, and are the main lever for model routing on host agents.

## Tradeoffs considered

- **Prose roles in the agent instruction file**: portable and trivial, but no tool/path restriction, isolation or per-role model. Rejected.
- **Fixed roster, toggles only**: easiest to test, but teams cannot define their own roles, against "almost any practice". Rejected.
- **Cost accepted**: the largest compiler surface, since agent definition formats differ per host (0002); hosts without native agents get the weaker rules-section form, marked advisory (0009).
