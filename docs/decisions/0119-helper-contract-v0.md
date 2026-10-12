---
id: 0119-helper-contract-v0
title: A helper is a pinned executable behind a JSON contract; its output is untrusted data and MCP is only a possible backend
status: active
date: 2026-10-11
tags: [architecture, roadmap, enforcement]
track: product
accepted-by: sergemso
---

## Decision

This fixes the contract that 0118 left as an intent. The protocol is **not built**; it is built when a second implementation of a kind exists, a third party wants to write one, or the trust steps of L.9 exist (the last trigger was dropped by 0142). Until then the in-tree interfaces (WorkSource, the host adapter registry) obey the same rules, so extraction is a move.

1. **Envelope.** One JSON request on standard input, `{protocol, kind, op, args}`, and one JSON response on standard output, `{ok, result | error, stale?}`. Errors are typed, a call has a timeout, standard output carries only JSON and standard error is scrubbed before it is shown.
2. **Lifecycle.** One process per call. A long-lived mode is added only for a measured need.
3. **Data only.** Arguments and results are plain data. No callbacks into the core, no shared mutable state, no values that cannot be serialised. The contract test of every in-tree interface enforces this.
4. **Capabilities.** A helper declares `read`, `write`, `network`, `spawns` and `hierarchy`; the project's pack answer lists the ones it allows, and a helper that needs more is refused.
5. **Identity.** A helper is named by a content digest in the project manifest and vendored by `apply`, with a protocol version range (0096, 0118).
6. **Environment.** A helper receives an explicit allowlist of environment variables, never the ambient environment; credentials are named in the pack answer and passed only to the helper that needs them.
7. **Output is untrusted.** Whatever a helper returns is data, not instructions. Text from a tracker or any helper passes through the secret and PII patterns before an agent sees it and never becomes a command: `Check:` and every other command stay in files the project owns.
8. **Off the enforcement path.** No guardrail check depends on a helper being present. A missing or failing helper degrades a feature and never allows or blocks a tool call.
9. **Contract tests.** The core ships a test suite that any helper of a kind must pass.

**MCP.** Three relations, kept apart:

- A helper may use an MCP server as its backend. That is an implementation detail: the helper declares `spawns` or `network`, and the contract above is what the core depends on. The core never speaks MCP.
- go-getter may expose its own verbs as an MCP server for hosts. That is a separate surface and does not change this contract (L.12).
- go-getter governs the MCP servers an agent uses directly: which servers a project allows, gating of their tool calls, masking of their output (L.11).

## Why

The in-tree interfaces are the future helper boundary, so the rules that make extraction cheap must hold from their first line. Treating helper output as data closes a real path: anyone who can edit a tracker issue could otherwise put a command into a gate that runs it. MCP is allowed behind a helper but not made the contract because its servers authenticate interactively, usually start through a network fetch (the failure 0096 exists for) and change their tool schemas by version.

## Tradeoffs considered

- **MCP as the helper protocol:** reuses what hosts speak, but the CLI and hooks run without a model and the schemas are not stable. A bridge can wrap an MCP server as a helper.
- **A long-lived helper first:** lower latency per call, but session state, restarts and a second failure mode for no measured need.
- **Writing the protocol only when needed:** cheaper now, but the in-tree interfaces would pick up shortcuts that make extraction a redesign.
- **Costs accepted:** a contract that binds code before any helper exists; each in-tree interface carries a contract test.
