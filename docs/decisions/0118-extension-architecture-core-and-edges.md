---
id: 0118-extension-architecture-core-and-edges
title: go-getter keeps a small core and moves the open-ended edges behind interfaces that can later become helper processes
status: active
date: 2026-10-11
tags: [architecture, roadmap, compiler]
track: product
accepted-by: sergemso
---

## Decision

**Boundary.** A capability moves to an edge when the set of its implementations is open, it touches the outside world (network, credentials, a third-party tool), it is off the enforcement path, and its interface is narrow data. Otherwise it stays in the core.

- **Core (in-tree):** the compiler, the pack format, guardrail and gate semantics, plan and step semantics, the hook runtime and the blocking checks (`gate-command`, `deny-path`, `secret-scan`). They run offline on every tool call and are what go-getter is.
- **Edges:** host adapters, work sources (plan steps in files or in a tracker, 0117), secret sources and sanitizers, telemetry exporters.
- **Data, not code:** spec-tool rows (0075), price tables, model catalogs, secret patterns. A declarative row comes before a helper, and a helper before core code.

**Order.** Each edge is first an in-tree interface with a contract test. It becomes a helper process only when a second implementation exists, or a third party wants to write one, or the trust steps below exist. Extraction is then a move, not a redesign.

1. **Host adapters first.** Host knowledge is spread across the core (per-host branches in `apply`, per-host renderers in `agents`, payload parsing in the hook runtime, the capability matrix, `coverage`). A host becomes one module that answers: instruction file, agent files, hook config, permission rules, plugin output, hook payload parsing, capability row and coverage row. A conformance test runs every adapter, and a fact template records the host's integration surface and which shapes are unconfirmed. Adding a host is then one module, one fact and a passing conformance run, which a contributor can do.
2. **Work sources second.** `plan` reads steps through a WorkSource interface (`list`, `get`, `create`, `setState`, `comment`); the file source is the built-in one and the GitHub tracker of 0117 is the second, in-process.

**Helper protocol (intent, not built).** A helper is an executable the core spawns: one JSON request on stdin, one JSON response on stdout (the shape of git credential helpers and protoc plugins). Its protocol version is separate from the pack format. It declares its kind and capabilities (`read`, `write`, `network`, `hierarchy`), and the pack answer lists the capabilities a project allows; a helper that asks for more is refused. It is identified by a content digest in the project manifest and vendored by `apply` into the repository, as the CLI is (0096), so it runs offline and an upgrade is a reviewable diff. The core keeps the verbs and their gating: a helper implements what a verb does, never when it runs. A pack may name a helper by digest and may not ship its own `run` commands.

**L.9.** Third-party packs become "load a helper or an adapter from outside the repository"; the pinning, provenance and capability list it required are defined above. L.9 still needs its own decision before anything loads foreign code.

## Why

The owner wants work items and plans to live where teams track them, and wants host support to stop depending on one maintainer: new host agents appear faster than releases, and each needs research into an undocumented or changing surface. A module per host and a conformance test lower the cost of a host now, and a helper protocol is the natural next boundary. Starting with the in-tree interface avoids a protocol designed from one implementation, and keeps the zero-dependency, offline enforcement the product rests on (`no-runtime-dependencies`, 0096).

## Tradeoffs considered

- **Hosts as out-of-process helpers now:** moves the code, not the research into each host's surface, and host hook payloads are parsed on the enforcement path. Needs the adapter module boundary first anyway.
- **Everything in-tree:** simplest, but every host and tracker waits for the maintainer.
- **Node modules loaded in-process (npm plugins):** easy to write, but runs foreign code with the CLI's authority and adds runtime dependencies.
- **MCP servers as helpers:** hosts speak it, but the CLI and hooks run without a model; a bridge can wrap one as a helper later.
- **Costs accepted:** a refactor of host code before any new host; a protocol and a test matrix once helpers exist; hosts stay in the core until a contributor asks for an external one.
