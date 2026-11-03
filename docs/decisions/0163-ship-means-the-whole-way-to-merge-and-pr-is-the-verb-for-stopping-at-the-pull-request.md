---
id: 0163-ship-means-the-whole-way-to-merge-and-pr-is-the-verb-for-stopping-at-the-pull-request
title: ship means the whole way to merge, and pr is the verb for stopping at the pull request
status: active
date: 2026-11-03
tags: [hooks, enforcement, dogfooding]
track: process
accepted-by: sergemso
supersedes: [0157-routine-actions-run-through-a-ship-verb-and-raw-equivalents-are-redirected]
---

## Decision

1. `go-getter ship` is commit, push, pull request, CI wait and squash merge on green, always. It has no flag that stops it short; `--no-merge` is removed. `--allow-no-ci` stays on it, because it governs the merge.
2. `go-getter pr` is checks, checkpoint, commit, push, pull request and the wait for CI, and never merges. It waits for CI by default; a red result or a timeout fails it, and a project with no CI gets a notice and a pull request left open. `--dry-run` previews either verb and writes nothing.
3. `ship` is `pr` followed by the merge, so the two cannot drift.
4. A raw push or `gh pr create` is redirected to `go-getter pr`; a raw `gh pr merge` to `go-getter ship`. The gate stops each verb whenever the outward class is gated and the project has not freed or granted all of that verb's parts (`pr`: push and pr-create; `ship`: those and pr-merge).
5. Everything else in 0157 stands: `go-getter release --batch`, `doctor` printing allow-rules for the verbs, and this repository using them.

## Why

0157 defined `ship` as the whole sequence, but stopping at a reviewable pull request had no sanctioned verb, and the redirect denied the raw commands. The only route was `ship --no-merge`, which makes one name mean "ship" or "almost ship" depending on a flag. A verb should say what it does: a person reading `pr` knows nothing merges, and reading `ship` knows everything does.
