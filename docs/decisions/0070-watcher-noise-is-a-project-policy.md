---
id: 0070-watcher-noise-is-a-project-policy
title: Watcher noise is a project policy, quiet by default, enforced by a wrapper rather than by the host
status: active
date: 2026-10-05
tags: [harness, cost, hooks, practice-packs]
track: process
accepted-by: sergemso
governed-facts: [0026-claude-code-watcher-and-hook-context-levers]
---

## Decision

- A watcher is a script an agent starts to sync on asynchronous work (a CI run, a long build or test, a deploy, a log) and whose output lines reach the model as notifications. Hook nudges and scheduled wake-ups are not watchers.
- The `context` pack gains a question, watcher noise: `quiet` (recommended), `normal` or `verbose`. The answer lands in a decision under `go-getter.watcher-noise` and is the project default; the go-getter plugin ships `quiet` as its own default, so a project that never answers still gets it.
- `go-getter watch [--noise <level>] [--until done] -- <command>` wraps any watch command. `--until done` blocks and prints one result (outcome, duration, last lines of a failure), the form recommended for CI runs and long commands; without it, `quiet` reports state changes and a final summary, collapses duplicates and bursts (60 s window) and stops after 6 notifications per hour with one notice; `normal` allows 30 per hour with a 10 s window; `verbose` only dedupes. The numbers are starting values for calibration (0017).
- Agents start watches through the wrapper (tier 1). Where a host hook can rewrite a watch call (Claude Code, fact 0026) a tier 2 hook enforces it; go-getter's own CI polling (0071) uses it. Hosts without a watcher tool stay advisory.

## Why

Each watcher line can wake a model turn that re-reads the whole context from cache, so a dozen notifications cost turns, not just tokens; the host offers no throttle, and a plugin monitor cannot read plugin options (fact 0026), so the knob is a project decision the wrapper reads, with a plugin-shipped default.

## Tradeoffs considered

- **Host or plugin setting**: no wrapper needed, but none exists on any host.
- **Instruction only**: free, but depends on the agent writing a quiet script every time.
- **Cost accepted**: a wrapper process per watch; a `quiet` default can hide a line the user wanted, which `verbose` restores.
