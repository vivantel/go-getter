---
id: 0175-partial-features-merge-behind-flags-and-flaky-checks-are-quarantined
title: Partial features merge behind a flag until accepted, and flaky required checks are quarantined and owned
status: active
date: 2026-11-03
tags: [coordination, ci, verification]
track: process
accepted-by: sergemso
---

## Decision

1. **Flags.** A feature whose plans merge before the whole is ready declares a `Flag`. Its plans merge to the default branch behind that flag, and the flag is turned on by the feature's acceptance (0172). Turning on a flag that reaches production is a release-level act and stays human (0155, 0159 item 2); a flag for a free channel (0162) does not.
2. **Flaky checks.** A required check that fails and then passes on the same commit with no code change is **flaky**. After three observations it is quarantined: removed from the required gate, still run and reported, and owned by a unit that go-getter files automatically with the evidence. A check that is part of a unit's own `Accept` is never quarantined.
3. **A flake does not stall the queue.** The merge queue (0167) reruns a failed required check once before returning the unit to its claimant; a second failure is a real failure.
4. **CI capacity is a budget.** A unit's budget (0165) bounds its CI runs; the merge queue may batch units that pass together. Reaching the bound parks the unit as a spend ask (0168).

## Why

Merging a feature built from many plans cannot wait for the last one, and one false red in a serial queue stalls every unit behind it. Flags let partial work land safely; quarantine keeps flakes from becoming the system's bottleneck without silently dropping a real check.

## Tradeoffs considered

- **Long-lived feature branches:** no flags, but late, large integrations and the conflicts this design removes.
- **Retry everything:** hides flakes and spends CI.
- **Cost accepted:** flag hygiene (a flag outliving its feature is a defect, found by lint), and a quarantined check is a hole in the gate until its owner unit fixes it.
