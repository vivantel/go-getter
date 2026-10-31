---
id: 0147-the-interview-is-a-pure-read-only-cli-verb-and-a-read-mcp-tool
title: The interview's question logic is a pure read-only verb, `interview next|validate`, which the active agent renders; an MCP wrapper serves it to adopted projects only
status: active
date: 2026-10-31
tags: [interview, practice-packs, compiler, hooks]
track: product
accepted-by: sergemso
---

## Decision

Extends 0022, 0085 and 0139; supersedes none.

1. **Two verbs own the question logic.** `go-getter interview next <pack-id> --answers <file>` returns the next question to ask, or `done`. `go-getter interview validate <pack-id> --answers <file>` returns the errors of an answers file (unknown option, `pattern` mismatch, answer to a skipped question). Both are pure functions of the pack and the answers file (or, with `--current`, of the answers recorded in the project's artifacts): no session, no state, no writes, so a crashed interview resumes from its file and an `update` gap is asked alone.
2. **`next` returns data the agent renders.** Per question: `id`, `type`, `options` (id, label, `tradeoff`), `recommended`, a resolved `prefill` (from `detect`, else `default`), `pattern`, and `batch`: the later questions that no unanswered question gates through `when`, which a host with a multi-question tool may ask together. The output names no host and no host tool (`neutral-source-has-no-host-specific-language`); each host's adapter or the skill maps it to the host's question tool, and falls back to plain text.
3. **Writing stays where it is.** Answers reach `docs/` only through `render-pack` and `reconfigure` after the one go-ahead of the `go-getter-init` skill. No interview verb writes.
4. **MCP is a wrapper, not a surface of its own.** A pack may declare `interview_next` and `interview_validate` as class `read` tools (0139 item 2); both verbs join the fixed in-code read-only list of 0139 item 3 and the test guarding it. An `interview` write tool is never exposed (0139 item 4). The server lists only adopted packs' tools, so it cannot serve a first install: the CLI verb is the primary surface and the skill uses it everywhere. MCP elicitation (the server asking the user itself) is not used: it bypasses the agent's question flow and the go-ahead.
5. **The skill shrinks to rendering.** `go-getter-init` runs `next` in a loop and no longer restates ordering, `when`, prefill or pattern rules.

## Why

The agent today re-derives order, conditions and prefills from prose and writes the answers JSON by hand, so correctness depends on the model. Moving the logic into a pure verb makes it deterministic, testable and token-cheap, and leaves question presentation to the active agent. A pure function adds no state to keep in step with the CLI and needs no change to the read-only rule of 0139.

## Tradeoffs considered

- **A stateful session (`interview start|answer`)**: simpler for the caller, but hides state, cannot resume from a file and would need a write verb in MCP.
- **Leave the logic in the skill**: no code, but it stays model-dependent and costs tokens on every run.
- **MCP-only**: typed tools, but unavailable before any pack is adopted.
- **Cost accepted:** a second reader of the pack schema to keep in step with `render`'s own `when` and fallback logic; the build should make both call one function.
