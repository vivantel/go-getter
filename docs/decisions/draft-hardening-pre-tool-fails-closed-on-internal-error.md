---
id: draft-hardening-pre-tool-fails-closed-on-internal-error
title: The pre-tool hook blocks a call that can change state when enforcement cannot run, and names the repair
status: draft
date: 2026-11-08
tags: [enforcement, tooling]
track: process
governed-facts: [0009-host-capability-matrix]
fitness-functions:
  - "the hook-failure-mode test passes: five failure cases block, read-only calls pass"
---

## Decision

Partly supersedes 0019 and 0025 (their fail-open rule for the pre-tool hook; the rest of both stands).

- When the pre-tool hook cannot evaluate a call (an unreadable guardrails directory, an unparseable guardrail, a guardrail entry that does not parse, an invalid gate pattern, a payload that is not JSON, any thrown error), it **blocks** the call unless the tool only reads or asks (read, search, web, todo, question tools), which passes.
- `stop`, `post-tool`, `session-*` and `user-prompt` stay fail-open: blocking them traps a session or hides output without protecting anything.
- A failure caused by go-getter itself is retried once before it blocks.
- Every block prints three things and no command text: what failed (file or guardrail), the repair (`go-getter doctor`), and for a person the one-call route (`go-getter approvals allow <shape>`). A user never has to switch go-getter off to proceed.
- Telemetry records `outcome: fail` with a trigger (`internal-error`, `unreadable-payload`), so the false-block rate shows whether fail-closed hurts.
- A missing runner or Node is not covered here: the hook never starts (plan step H3).

## Why

A fail-open hook lets a broken or tampered guardrail file switch every check off with no signal, which a hard control must not allow. Blocking only state-changing tools keeps reads usable while the repair is made.

## Tradeoffs considered

- **Stay fail-open, warn loudly**: no false blocks, but the control is only as strong as its files' integrity.
- **Block every tool**: stronger, but a broken guardrail then stops even reading the file to repair it.
- **Cost accepted**: a damaged guardrail file stops edits and shell calls until `go-getter doctor` is run; the approval route remains for a person.
