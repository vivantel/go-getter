---
id: 0157-routine-actions-run-through-a-ship-verb-and-raw-equivalents-are-redirected
title: Routine actions run through a deterministic ship verb, and raw git and gh equivalents are redirected to it
status: superseded
superseded-by: 0163-ship-means-the-whole-way-to-merge-and-pr-is-the-verb-for-stopping-at-the-pull-request
date: 2026-11-01
tags: [hooks, enforcement, dogfooding]
track: process
accepted-by: sergemso
---

## Decision

1. `go-getter ship` runs attribute, push, PR, CI watch and squash-merge on green as one deterministic command; `go-getter release --batch` releases what has merged. Neither needs a model.
2. A pre-tool hook denies the raw git/gh sequences a verb covers and names the verb (guardrail `raw-commands-redirect-to-verbs`). Hosts without a blocking hook get the instruction plus the git-hook floor (0009).
3. `go-getter doctor` prints the host allow-rules for these verbs, so a host permission classifier passes them.
4. This repo installs its own plugin and uses the verbs (0010), so the tool is exercised daily.

## Why

Fact 0040: the owner objected three times to routine actions done by hand in shell instead of by the tool, and a host classifier then blocked those hand-run commands and returned the work to the owner. A fixed verb is token-free, cannot be improvised around, and has one allow-rule.
