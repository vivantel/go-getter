---
id: 0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units
title: Declared scope and a serial merge queue prevent collisions between parallel units, and shared artifacts need no shared counter
status: active
date: 2026-11-03
tags: [coordination, ci, architecture]
track: process
accepted-by: sergemso
---

## Decision

1. **Scope is declared.** A unit's brief lists its scope: path globs, the interfaces it owns or changes, and the shared artifacts it needs. A claim whose scope overlaps a live claim's is queued, not refused: it becomes ready when the overlapping claim ends. A unit with no declared scope falls back to the paths its `Do` text names (the rule of 0156).
2. **Scope is enforced.** The verification gate fails a change that touches a path outside its unit's scope. A unit that needs something outside its scope files a **change request** to the unit that owns it (a child unit under the owner's parent, or a comment on its issue); it never widens its own scope.
3. **A serial merge queue integrates.** `ship` enqueues a green change; the queue takes one at a time, rebases it on the default branch, reruns the gate stack (0158) and merges on green. A red result returns the unit to its claimant with the failing check. A host-native merge queue may be the implementation. Overlaps nobody declared are caught here, not earlier.
4. **No shared counter or shared edited index.** A new fact or decision is filed under a unit-scoped draft id (`draft-<unit>-<slug>`); the merge queue assigns the final `NNNN` number when it merges, and `INDEX.md` rows are generated from the artifacts' frontmatter, never hand-edited. This changes the filing rule "next free number" in `shared/artifact-model.md` and `AGENTS.md`; a wording change to a committed rule is allowed (0067).

It narrows 0156, whose conflict-awareness covered only steps within one plan on one machine.

## Why

With thousands of parallel units, three shared things collide: files two units edit, the next decision number, and the four index files every artifact PR edits. Declared scope prevents the known collisions cheaply; the queue turns the unknown ones into a rebase, not a broken default branch; generated ids and indexes remove the collisions that are structural.

## Tradeoffs considered

- **Optimistic only:** no planning cost, but rework and retry storms grow with the number of units and semantic conflicts reach CI.
- **Pessimistic path locks:** no collisions, but a stalled holder, often a human, blocks everyone behind it.
- **Cost accepted:** authors must declare scope, a wrong scope fails the gate, and the queue serialises merges, so its throughput bounds the system (measured by 0170, tested by the soak test of work-coordination K18).
