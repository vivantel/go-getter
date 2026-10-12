---
id: 0136-host-adapter-interface
title: A host adapter answers nine questions as plain data and shares the rest
status: draft
date: 2026-10-12
tags: [architecture, compiler, host-agents]
track: product
---

## Decision

Draft, for the owner's sign-off. It fixes the interface 0118 asks for, from the thirteen places in fact 0035. Per 0119 an adapter takes and returns plain data (no callbacks, no shared state, a JSON round trip is lossless) and nothing in it depends on a helper process.

An adapter for host `H` answers, given the project, the capability row and the resolved options:

1. `detect`: the paths that show `H` is used (fact 0035 row 12).
2. `instructions`: the instruction file and what points at it (row 6).
3. `agents`: the agent file path and content per role, read-only tool names included (row 8).
4. `skills`: where skills are linked or copied (row 7).
5. `hooks`: the hook config file and its content for the events asked for, or the plugin source (rows 2, 3, 4), and which files it shares with other hosts (row 5).
6. `permissions`: the ask rules in the host's format (row 9).
7. `parse`: a hook payload to `{ tool, input, session }` (row 10).
8. `answer`: a decision (`allow`, `deny`, `ask`, `replace`) to the host's exit code and output, for pre-tool, post-tool and stop (row 11).
9. `settings`: prompt-log off, cache TTL, spend flag and telemetry target (row 13).

The capability row stays the data source for what the host can do (row 1); the adapter says how. Shared in the core: the tool classes and path scanning behind `parse` once the payload is normalised, the gate and guardrail semantics, `apply`'s planning, ownership and manifest, and `coverage`. An adapter that cannot answer a question because its capability is absent says so and never guesses; a shape not yet confirmed stays marked in the host's fact.

The three first hosts (Claude Code, OpenCode, Kilo) implement all nine; Codex, Cursor, Gemini CLI and Copilot are reached through one wrapper that delegates to today's code with no change in output.

## Why

Row by row, the same nine questions are answered by a branch in a different file for each host. Naming them lets a missing host be one module and a passing conformance run (0118), without moving the enforcement path out of process.
