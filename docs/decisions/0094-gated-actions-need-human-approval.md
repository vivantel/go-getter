---
id: 0094-gated-actions-need-human-approval
title: Irreversible and outward-facing commands need a human, through native ask rules where they can be tested and a hook hand-over elsewhere
status: active
date: 2026-10-09
tags: [harness, hooks, enforcement, practice-packs]
track: process
accepted-by: sergemso
governed-facts: [0009-host-capability-matrix]
---

## Decision

From the owner's interview on the human-in-the-loop pack (component 8, plan step C.3), 2026-10-09. It makes the advisory rule of decision 0043 (hand over before irreversible or outward-facing actions) enforced for shell commands.

- **What is gated**: shell commands of two classes. *Irreversible*: force-push, history rewrite, hard reset, `rm -rf` outside a temporary directory, destructive SQL, deleting a branch or tag. *Outward-facing*: `git push`, opening or merging a pull request, creating a release or tag, publishing a package. The pack ships one catalog of command patterns for both classes and a project list question that adds patterns. Spend over a threshold is not gated yet.
- **Catalog width**: every verb of both classes, not a high-risk subset. Native rules match command text, not the branch, so a feature-branch push cannot be told from a default-branch push; prompting on both is the safe failure. A person who wants fewer prompts allows a verb in their own host settings, which are not committed.
- **Native ask rules** on the hosts that are installed here and covered by the install smoke test: Claude Code (`permissions.ask`), Kilo and OpenCode (`permission.bash` with `ask`). The host prompts the human.
- **Hook hand-over** on Cursor, Codex, Gemini CLI and Copilot: the shared pre-tool hook denies a gated command with a message that a human must approve it, and the human runs it themselves. The hook does not gate the hosts that have native rules, so a hook deny never hides a host prompt. Cursor and Codex move to native rules (Cursor `ask`, Codex `prompt` rules, which the vendor marks experimental) once someone has tested them.
- **Not covered**: a mode that skips permission prompts defeats native ask rules; a command wrapped in `sh -c` or `eval` is matched on its literal text only.
- This repo adopts the pack with both classes and the full catalog, so its agents prompt for pushes, pull requests and releases.

## Why

Decision 0043 asks agents to stop before costly actions but nothing stops one that does not; the capability matrix (fact 0009) shows a blocking hook or permission on six of seven hosts. Native rules are the host's own harness (0015: configure, do not build a runtime) and cost nothing to maintain; the hook covers the hosts without a project-scoped ask rule, using machinery already generated for restricted paths.

## Tradeoffs considered

- **Hook runtime with approval tokens on every host**: one behaviour, but go-getter would own an approval runtime and its state, against 0015.
- **Native ask only**: smallest change, but Cursor, Codex, Gemini CLI and Copilot would stay advisory.
- **Native rules on every documented host now**: better prompts on Cursor and Codex, but both are untested here and a blind write can break a host's settings file or turn the gate off silently when an experimental format changes.
- **High-risk subset or a project-defined catalog**: fewer prompts or more precision, but a bare `git push` on the default branch slips through natively, and an owner who skips the list gets no gate.
