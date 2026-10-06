---
id: 0030-tool-output-redaction-runtime
title: The post-tool hook redacts restricted-file values, private-key blocks and known token prefixes from tool results on the hosts that can replace them
status: active
date: 2026-10-06
tags: [governance, security, hooks, compiler]
kind: decision
governed-by: 0072-restricted-paths-have-access-modes
---

- `go-getter hook post-tool --host <id>` (`compiler/src/hook.mjs`) replaces every match in every string of the tool result with `[redacted by go-getter]`, keeping the result's shape: values of `KEY=value` lines (8+ characters) of restricted files in the project of every mode (`use` and `sink` are treated as `deny` until `go-getter secret run|put` exist), private-key blocks (to the end of output when truncated), and AWS, Google, GitHub, GitLab, Slack, npm, Anthropic and Stripe token prefixes.
- It answers only when something was redacted; the telemetry line records the count (`redactions`), never the result. A failure lets the result through unchanged (fail open, decision 0019).
- `apply` installs it where tier-2 path guardrails exist and the host's capability `hooks.rewriteOutput` is true: Claude Code, Codex, Copilot, Gemini CLI and Kilo (facts 0027, 0031), each answered in its own shape by `respondPostTool`.
- Limits: restricted files are found by walking the project (skipping `.git` and `node_modules`, files over 256 KiB, symlinks); a value split, encoded or shorter than 8 characters passes.
