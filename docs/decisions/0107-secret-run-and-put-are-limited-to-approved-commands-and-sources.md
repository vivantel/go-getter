---
id: 0107-secret-run-and-put-are-limited-to-approved-commands-and-sources
title: secret run runs only commands approved for that secret, secret put takes stdin or a declared command, and sandbox snippets are printed, never written
status: active
date: 2026-10-10
tags: [governance, security, enforcement]
track: product
accepted-by: sergemso
---

## Decision

Refines 0072 for slice S4. It activates the recorded `use` and `sink` modes.

- **`go-getter secret run`** passes a `use` path to a command without the model seeing it: `--from <dotenv>` sets its KEY=VALUE entries in the child's environment; `--file <path>` copies the file to a 0600 temporary file, passes its path in an environment variable and deletes it afterwards. It runs only commands on that path's allowlist, a pack answer pairing each `use` pattern with the commands that may receive it, and refuses when none is declared. The child's output is scrubbed of the values and the shared patterns (0106) before it is printed.
- **`go-getter secret put`** writes a `sink` path from stdin or from a command declared for that path, with mode 0600, and prints nothing of the value. There is no built-in keychain or secret store: a secret manager with a CLI is reached through the declared command.
- **The hook exemption** stays exactly as 0072 states it: a call that is exactly `go-getter secret run` or `go-getter secret put`, for paths of the matching mode, and no other go-getter command.
- **`go-getter sandbox [--host <h>]`** prints a settings snippet for user settings, built from the restricted paths and `use` secrets, for each host with a documented lever (Claude Code `sandbox.credentials`, Codex permission profiles, Gemini CLI `environmentVariableRedaction`, Copilot `--secret-env-vars`). Each line is marked confirmed or not from facts 0027 and 0031; hosts without a lever say so. It writes nothing, and `apply` never writes these settings.

Stated limits: a secret still reaches a process that could send it elsewhere, so `use` is advisory without a sandbox that has a network allowlist (decision 0050); an approved command that itself echoes or encodes the secret defeats scrubbing.

## Why

Scrubbing an exact value cannot catch a re-encoded one, so an agent allowed to run any command could exfiltrate a `use` secret with `run -- sh -c 'echo $X | base64'`. Pairing each secret with the commands that may receive it removes that, at the price of one answer per path. A declared command for `put` supports every secret manager without go-getter testing on each operating system, with no dependencies.

## Tradeoffs considered

- **Any command, with the limit stated**: easiest, but `use` then guards against accident only.
- **Allowlist plus refusing shell metacharacters**: strongest, but it blocks legitimate scripts and the matching is heuristic.
- **Built-in keychain reading**: convenient, but platform-specific shelling out to test on each OS.
- **Snippets inside `coverage`**: no new command, but a paste-ready snippet is easy to miss in a status report.
- **Cost accepted**: a refused `run` is reported to a human, who adds the command to the answer.
