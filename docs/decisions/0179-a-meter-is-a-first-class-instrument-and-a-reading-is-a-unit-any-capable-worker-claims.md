---
id: 0179-a-meter-is-a-first-class-instrument-and-a-reading-is-a-unit-any-capable-worker-claims
title: A meter is a first-class instrument and a reading is a unit that any capable worker claims
status: active
date: 2026-11-03
tags: [coordination, observability, architecture]
track: product
accepted-by: sergemso
---

## Decision

1. **A meter** is declared in the project (a file under `docs/meters/<id>.md`, frontmatter and a short description) with: an id; what it reads; the source (a command, an API, a survey, a person, an agent with a manipulator); the capability tags a worker needs to take a reading (0181); the refresh rate; the cost of one reading; the expected noise; the owner; and the data class of what it reads.
2. **A reading is a unit** of kind `measure` (0165). It is claimed through the pull protocol (0169) like any unit, taken by any worker with the capabilities, and its result is recorded as metadata plus the value (never raw private content, `telemetry-records-metadata-only`). A scheduled meter creates its next reading unit when the refresh interval passes.
3. **A reading is data, stored in one shared ref per meter.** `go-getter measure read` appends the reading (meter id, time, value, reader) as a commit to `refs/go-getter/readings/<meter>` on the remote, outside the working tree, with no numbered fact and no merge-queue pass per reading. Every worker can fetch the ref, so acceptance by a worker other than the author (0172) sees the same readings. Retention is a meter attribute and old commits are squashed to the retained window. `go-getter measure series <meter>` aggregates it; interpretation belongs to discover (0177). A reading holds the value and metadata only, never raw private content, and a meter whose value is itself restricted data is class-limited like any other (0179 item 1, `restricted-paths-denied`).
4. **Real-world readings obey grants.** A reading that needs a physical or paid action carries the effect classes of 0180 and runs inside the claimant's cap.
5. **Meters have owners and costs.** A meter whose cost per reading exceeds the budget of the outcomes that use it, or that no outcome uses, is flagged in lint.

## Why

Treating feedback as a meter with a refresh rate makes the real world a data source like any other, and lets the existing claim, grant and metric machinery handle it without a new mechanism, including agents that act physically to read it.

## Tradeoffs considered

- **Readings outside the framework:** less to build, but acceptance by meter (0178) then rests on data nobody coordinates, attributes or budgets.
- **Cost accepted:** a meter file format, a scheduler for refresh (a unit created on a schedule, no daemon), and a ref that grows quickly for fast meters (retention squashes it); and a remote that refuses refs outside `refs/heads` and `refs/tags` makes the meter unusable there, which `measure define` reports.
