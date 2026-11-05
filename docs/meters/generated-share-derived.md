---
id: generated-share-derived
title: Share of enforcement entries that are derived
status: active
reads: enforcement entries with `origin: derived` over all enforcement entries, of the ref it is read on
source: "command: node compiler/src/meters/generated-share.mjs --share derived"
command: node compiler/src/meters/generated-share.mjs --share derived
capabilities: [shell]
refresh: 1d
cost: 0
noise: none; the reading is a count taken from a git tree, so the same ref gives the same value
owner: sergemso
data-class: public
retention: 365d
---

Daily reading for thesis C4 of the paper (plan `docs/plans/paper-instruments.md`, step P5). Decisions: 0179 (meters), 0204 (the `origin` field), 0207 (the `command` field).

## What one reading is

A fraction between 0 and 1, rounded to 6 decimals (not a percentage): enforcement entries with `origin: derived` (an entry with no `origin` counts as `authored`, 0204) over all enforcement entries (`go-getter.enforcement`).

Numerator and denominator are counted in the guardrail files named by the denominator rule.

## Denominator rule

The denominator is the live top-level `docs/guardrails/*.md` of the ref it is read on, excluding `archive/` and `INDEX.md`.

Both counts are taken over exactly those files, from the git tree of the ref (`HEAD` unless `--ref` is given), not from the working tree. When the denominator is 0 the command fails and nothing is recorded.

## How a reading is taken

`go-getter measure read generated-share-derived` runs the `command` above in the project root and records what it prints. No person estimates a figure. The raw counts behind a reading are recoverable with `node compiler/src/meters/generated-share.mjs --counts [--ref <ref>]`, which prints `{derived, entries, advisory, guardrails}`.
