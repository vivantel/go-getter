---
id: 0015-configure-host-agent-harness-not-own-runtime
title: go-getter configures and complements host agents' harness; it does not run its own agent runtime
status: active
date: 2026-10-04
tags: [harness, host-agents, architecture, positioning]
track: product
accepted-by: sergemso
governed-facts: [0002-agent-harness-and-host-agent-terminology]
---

## Decision

Host agents already provide the execution loop, the tool registry and part of the sandbox. go-getter configures and complements the harness components through each host's extension points — skills, subagents/agents, commands, hooks, permissions and settings, MCP servers — plus host-independent git hooks, CI and small Node scripts.

go-getter does not run its own agent loop, model-API client or routing proxy. Where a host does not expose what a component needs (e.g. a hard spend kill-switch, checkpoint rollback, blocking DLP), go-getter approximates it at a lower enforcement tier (0009) and reports it as such for that host.

## Why

Riding host agents is what makes setup zero-friction on all seven (0002); users keep the tool they already use and gain a production-grade harness around it.

## Tradeoffs considered

- **Own harness runtime**: full control of all 12 components and of routing, but competes with host agents, is a very large build and contradicts 0002.
- **Configure hosts now, own runtime layer later**: keeps the door open (routing proxy, collector, headless orchestrator), but adds a roadmap commitment. Not taken; can be revisited by a new decision.
- **Cost accepted**: component strength is capped by each host's extension points.
