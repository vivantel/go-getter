---
id: 0169-go-getter-defines-a-pull-protocol-for-workers-and-runs-no-fleet
title: go-getter defines a pull protocol for workers and runs no fleet; the agent cap is per worker
status: active
date: 2026-11-03
tags: [coordination, architecture, harness]
track: product
accepted-by: sergemso
---

## Decision

1. **Protocol, not runtime.** go-getter provides verbs: `work next` (the ready unit whose scope is free, whose owner kind fits the worker, ordered by priority, 0174), `claim`, `heartbeat`, `brief`, `report`, `release`, `park`, `accept`. A **worker** is anything that calls them: a host-agent session, a cloud agent, a CI job or a person. No daemon, server or scheduler is added; coordination state is git refs (0166) and the tracker.
2. **The cap is per worker.** `max-concurrent` (0156) bounds the agents one worker runs at once on its machine, each in its own worktree. The system's load is bounded by unit and tree budgets (grants, 0171), by WIP limits (0174) and by the merge queue (0167), not by a fleet count.
3. **Dispatch is the operator's choice.** Who starts workers, and how many, is outside go-getter (a person starting sessions, a CI schedule, a cloud agent service). `work next` is safe to call from any number of them.
4. **Starting is still a human act at the root.** A human starts the root claim (0130 item 1); below it, delegation follows narrowing grants (0171).

## Why

Thousands of units cannot run on one machine, and a central coordinator is a runtime to host, secure and keep alive, against 0015 (configure host agents, own no runtime) and `no-runtime-dependencies`. A pull protocol over git keeps one source of truth that every host and every human already has.

## Tradeoffs considered

- **Central coordinator service:** the strongest consistency and the easiest global view, but a single point of failure and a runtime.
- **Raise the cap on one machine:** no new surface, but it ignores collaboration between several people and their agents.
- **Cost accepted:** no push scheduling or load balancing; a slow or absent operator means units wait, which `work tree` (0174) shows.
