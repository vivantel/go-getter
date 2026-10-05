---
id: 0067-accepted-artifacts-may-be-corrected-in-place
title: Accepted decisions and facts may be corrected in place for wording and factual errors; a change of meaning is superseded
status: active
date: 2026-10-05
tags: [knowledge-management]
track: process
accepted-by: sergemso
---

## Decision

1. Wording fixes (renamed terms, stale counts, typos) and factual corrections to accepted decisions and facts may be edited in place, on the owner's instruction. The `id`, file name, `status` and stated rationale stay as they are.
2. A change to what a decision commits to is made by a new decision that supersedes it (decision 0066 superseded 0006 and 0007 this way). That rule stands.
3. Ids and file names are never renamed, because other artifacts reference them. A slug that has become inaccurate stays and the artifact's own text is the truth. Known cases: `0002-six-host-agents-from-v0-1` (seven host agents since Kilo and OpenCode became two hosts) and `0005-kilo-opencode-integration-surface` (research shared by two hosts).
4. The pull request that makes such an edit says so in its description.

## Why

The host split and the wording pass of 2026-10-05 corrected accepted decisions and facts in place at the owner's request, while AGENTS.md said decisions are immutable, so the exception lived only in a conversation. Recording it keeps the rule honest: immutability protects commitments, not typos.

## Tradeoffs considered

- **Supersede for every correction**: strict, but a chain of near-identical decisions for edits that change nothing.
- **Rename ids and files to match their content**: accurate slugs, but breaks every reference to them.
- **Cost accepted**: a reader cannot tell from git alone whether an edit was a correction or a change of meaning; the PR description is where that is stated.
