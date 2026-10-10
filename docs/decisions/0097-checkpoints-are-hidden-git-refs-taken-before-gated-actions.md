---
id: 0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions
title: A checkpoint is a hidden git ref taken by the pre-tool hook before a gated action, and the last 10 are kept
status: active
date: 2026-10-10
tags: [practice-packs, harness, hooks, enforcement]
track: process
accepted-by: sergemso
---

## Decision

Interviewed 2026-10-10 for plan step C.4 (component 9, state and checkpointing); the owner took the recommended answer to every question.

- **Trigger**: before a command the hitl pack gates (0095), and optionally before `go-getter plan start`. Not before every edit batch: hosts with native checkpointing (Claude Code `/rewind`, Gemini CLI `/restore`) already cover edits.
- **Mechanism**: `go-getter checkpoint create` writes a commit of the working tree (tracked and untracked, not ignored) to `refs/go-getter/checkpoints/<time>-<label>` using a temporary index, so the working tree, index, branches and `HEAD` are untouched. Restore shows what differs and changes files only with `--yes`.
- **Creation**: the pre-tool hook creates it, best effort, never blocking, on every host with a working pre-tool hook, including hosts whose gated commands go to native ask rules (the hook matches the full catalog for this, not for denial). Elsewhere an instruction-file rule tells the agent to run the command (tier 1).
- **Retention**: the 10 newest are kept; `create` prunes the rest.
- **Pack**: `checkpointing`, with questions for triggers, creation and retention only; the mechanism is fixed by this decision.

## Why

Component 9 is tier 2 only on Claude Code and Gemini CLI (fact 0009), and neither native checkpoint covers what a shell command does (`git reset --hard`, `rm -rf`). A git ref needs no host support, survives the session, and costs a few kilobytes. Gated actions are the moments rollback matters and are rare, so automatic checkpoints there are cheap.

## Tradeoffs considered

- **`git stash create` only**: misses untracked files, which an agent often just created.
- **WIP commit on a branch**: visible but pollutes branches and needs cleanup.
- **Tag on `HEAD`**: records committed state, not the uncommitted work that is at risk.
- **Instruction only**: relies on the agent complying.
- **Git hook only**: fires on git operations, not on `rm -rf` or edits.
- **Cost accepted**: ignored files are not captured, and a restore does not delete files created since the checkpoint (it lists them for the human).
