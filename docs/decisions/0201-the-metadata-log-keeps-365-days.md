---
id: 0201-the-metadata-log-keeps-365-days
title: The metadata log keeps 365 days
status: active
date: 2026-11-04
tags: [observability, harness]
track: process
accepted-by: sergemso
supersedes: [0052-telemetry-retention]
go-getter:
  telemetry-retention-days: "365"
---

## Decision

1. The recorder prunes log lines older than 365 days on every write, in place of 30 (decision 0052). The recording mode (decision 0051) is unchanged: metadata only, local, gitignored.
2. The value is read from `go-getter.telemetry-retention-days` of the active decision, as before.
3. The value is a floor for the paper's evidence, not a target. A later decision may shorten it once the paper's windows are closed and their numbers are reproduced and archived (the deterministic-edge paper's rule that every figure is reproducible).

## Why

0052 kept 30 days because calibration needs only recent data. The deterministic-edge paper (its decisions are on the branch `docs/article-deterministic-edge`) compares a baseline window with a treatment window, and the baseline has to outlive the instruments that are added after it, so a comparison made months later must still find its records. At 30 days the log of the main checkout, which starts on 2026-10-31, loses its first records on 2026-11-30, before the baseline can be read.

The cost is small and local: the log holds metadata only (decision 0051, fact 0022), it is gitignored, and it never leaves the machine. 365 days covers a baseline, the intervention steps P2 to P6 of the paper-instruments plan, a treatment window and a re-check. The owner may change the number; nothing else in this decision depends on it.

## Consequences

- 0052 becomes `superseded`; its pack answer `retention: 30` no longer matches the adopted value, so `go-getter doctor` or the next `update` may flag the drift and the pack answer has to be re-recorded as 365.
- The test in step P1 sets the value, writes a record dated 31 days ago and shows it survives a write.
