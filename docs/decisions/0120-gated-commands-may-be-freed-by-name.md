---
id: 0120-gated-commands-may-be-freed-by-name
title: A project may let named outward-facing commands run without a human; irreversible ones never
status: active
date: 2026-10-11
tags: [practice-packs, hooks, enforcement]
track: process
accepted-by: sergemso
---

## Decision

The hitl pack (0.3.0) asks which outward-facing catalog commands may run without a human (`free-commands`, a list of catalog ids, empty by default). A freed command is not gated: no native ask rule is written for it and the pre-tool hook lets it through. Only outward-facing commands can be freed: force-push, branch and tag deletion and every other irreversible command stay gated whatever the list says. This refines 0095, which gates both classes; the recommended answer frees nothing.

For a plain `git push`, the project relies on what stops a push to the default branch elsewhere: a git hook that reads the pushed refs (git-workflow pack) and branch protection on the host.

## Why

A feature-branch push is reversible and cannot reach the default branch where those two guards exist, so asking for each one costs attention and protects nothing. The native ask rules are prefix globs that cannot tell a feature branch from the default branch, and an ask rule beats an allow rule on Claude Code, so the only way to stop the prompt is not to write the rule.

## Tradeoffs considered

- **"Irreversible only":** one answer, but pull requests, merges and releases also stop asking.
- **A branch-aware push rule:** exact, but the hosts' ask rules match command text, not the checked-out branch.
- **A local allow rule:** loses to the ask rule on Claude Code.
- **Cost accepted:** a project that frees `git-push` without a default-branch guard lets an agent push to it unasked; the question says so.
