---
id: 0001-go-getter-product-scope-and-name
title: go-getter sets up the agent harness and SDLC practices for AI-driven development with minimal effort
status: active
date: 2026-10-04
tags: [positioning, harness, roadmap]
track: product
accepted-by: sergemso
---

## Decision

Agent = Model + Harness (terminology in fact 0002). go-getter is a set of skills, commands, agents and plugins that sets up and maintains, with minimal effort:

1. **The agent harness** around the model — all 12 components: orchestration loop, tool registry, execution sandbox, context management, short/long-term memory, verification & self-correction loops, guardrails & safety (including security, DLP and governance of local vs. cloud LLM usage), human-in-the-loop gates, state & checkpointing, multi-agent orchestration, token & cost management (including model routing), observability.
2. **The SDLC practices** the agent works within — branching strategy, workflow, git worktree usage, parallelization, testing, coverage and debugging, commit and PR rules, agent roles & responsibilities, release, review, docs.

It does this by configuring host agents rather than replacing them (0015). The goal is the required quality at minimal token spend — fast, robust, sophisticated and zero-friction.

"go-getter" means a person who gets things done. It has nothing to do with the Go language. The product is dogfooded from the first commit (0010).

## Why

The user wants one product covering "generally all SDLC needs for almost any practice", where setting up a production-grade agent harness takes minimal effort.

## Tradeoffs considered

- **A single-practice tool** (e.g. only worktrees or only routing): far smaller, but misses the stated goal.
- **Name collision**: HashiCorp's `go-getter` is a well-known Go library. Accepted: the name carries the product's intent.
