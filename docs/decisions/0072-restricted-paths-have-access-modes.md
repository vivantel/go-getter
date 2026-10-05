---
id: 0072-restricted-paths-have-access-modes
title: Restricted paths have access modes deny, use and sink, enforced in layers that state where they stop
status: active
date: 2026-10-05
tags: [governance, security, enforcement, hooks]
track: product
accepted-by: sergemso
governed-facts: [0027-claude-code-secret-use-and-output-redaction-levers]
fitness-functions:
  - "A hook-runtime test shows a tool call that only names a restricted path inside prose is not blocked, and a read of the path is blocked"
---

## Decision

Refines 0045 and 0046 without changing what they commit to (the default mode is today's behavior, so 0046 stays true): a restricted path gets one mode.

- `deny` (the default, today's behavior): not read, written, used or committed.
- `use`: a go-getter tool or a host sandbox may pass the content to a child process; the content is never shown to the model and tool output is scrubbed of it.
- `sink`: written only through a go-getter tool from a declared source (stdin, a command, a secret store) without being read back.

Layers, strongest first: host sandbox credential deny or mask (mask only from user or managed settings; fact 0027); tier 2 pre-tool hook with structured path extraction (the tool's path, command and file arguments, not every string); tier 2 tool-output redaction where the host can replace output; tier 3 secret scanning in git hooks and CI. The tools `go-getter secret run|put`, PII masking and the scanning builtins follow the first slice (the plan names the order). Until `secret run|put` exist, `use` and `sink` stay recorded but inactive and the paths are treated as `deny`; the only exemption is a call to those two named subcommands, never any go-getter command that runs a user-supplied command.

Stated limits: hooks are heuristic and indirection can bypass them; a `use` secret reaches a process that could send it elsewhere, so `use` needs a sandbox with a network allowlist and is advisory where the host has none (fact 0009, decision 0050); PII masking is pattern and checksum based, with no external dependency (guardrail `no-runtime-dependencies`).

## Why

The owner asked for secrets an agent can use without reading and write without reading; deny-only forces secrets out of reach of the agent, and the hook's every-string matching already blocks harmless calls (seen on 2026-10-05, when a prompt that only mentioned a dotenv file was blocked).

## Tradeoffs considered

- **Deny-only**: strongest and simplest, but agents cannot run anything that needs a secret.
- **Native host features only**: no code of ours, but only Claude Code has them and its mask is not shippable from a repository (fact 0027).
- **Whole layer in one step**: fewer PRs, too large to review; the first slice is modes, the hook fix and output redaction.
- **Cost accepted**: a larger governance pack and honest per-host reporting of what holds.
