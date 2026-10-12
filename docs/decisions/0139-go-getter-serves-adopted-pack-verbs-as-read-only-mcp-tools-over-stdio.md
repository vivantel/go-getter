---
id: 0139-go-getter-serves-adopted-pack-verbs-as-read-only-mcp-tools-over-stdio
title: go-getter serves the verbs of the packs a project adopted as read-only MCP tools over stdio, opt-in
status: active
date: 2026-10-12
tags: [architecture, roadmap, hooks, compiler]
track: product
accepted-by: sergemso
---

## Decision

The L.12 interview (2026-10-12) settled go-getter as an MCP server. It is the separate surface of 0119 and changes nothing in the helper contract; the core still never speaks MCP as a client.

1. **A small surface that is not autonomous-only.** The server exists for hosts and surfaces where running a shell command is restricted or prompts on every call, and for typed, discoverable tools. Its tools serve interactive work as much as autonomous work.
2. **The tools follow the packs a project adopted.** A pack declares the MCP tools it contributes (name, description, input schema, the CLI verb it maps to, class `read` or `write`); the server lists the union over the project's adopted packs and nothing else. A project that adopts no pack with tools gets an empty server, and enabling it is an answer, off by default.
3. **Version 1 is read-only.** Shipped tools are class `read`: plan status and next, refs, coverage, reading the knowledge base (decisions, facts, guardrails, skills), and views of a run (`run status`, `run next`). The pack format allows a `write` class so a later pack can add tools under the write treatment of 0138; none ships now.
4. **Never exposed, whatever a pack declares:** `run start|end`, `approvals add|allow|revoke`, `secret`, and any verb that changes what an agent may do without asking (0126, 0130). A test enforces the list.
5. **Transport is stdio only.** `go-getter mcp serve` is a local process the host spawns: no listener, no network, no new dependency (JSON-RPC over stdio is written in-tree, `no-runtime-dependencies`).
6. **Wiring is opt-in.** With the answer on, `apply` writes the server entry in each host's MCP configuration (owned and removable, `owned-files-never-clobbered`), and the MCP allowlist of 0138 lists `go-getter` automatically. The answer's pack home is `orchestration` unless the build finds a better one.
7. **Output is metadata and project text only.** A tool returns what its CLI verb prints, after the same secret and personal-data check as other tool output; it reads no restricted path.

## Why

The CLI already does all of this for an agent with a shell, so the server is justified only where that fails or where typed tools help. Tying tools to adopted packs keeps the surface honest (a project is not offered `coverage` when it adopted no coverage) and avoids a hand-kept list. Read-only first keeps the server off the approval problem until a real write need exists, and the never-list protects the human-only acts of the run and approval design.

## Tradeoffs considered

- **Not building it:** the CLI and skills already work; rejected because some hosts restrict shell use.
- **Full verb set from the start:** more reach, but pulls plan and run writes into MCP before the write class of 0138 is in use.
- **A fixed verb list independent of packs:** simpler, but offers tools a project never adopted.
- **stdio and HTTP:** serves remote hosts, but adds a listener and an authentication question.
- **Always on in the plugin:** zero setup, but silently adds a server to every host.
- **Cost accepted:** a second surface to keep in step with the CLI; tool schemas per pack; hosts differ in where they read MCP configuration.
