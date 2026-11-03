---
id: 0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units
title: Declared scope and a merge queue prevent collisions between parallel units, and shared artifacts need no shared counter
status: active
date: 2026-11-03
tags: [coordination, ci, architecture]
track: process
accepted-by: sergemso
---

## Decision

1. **Scope is declared.** A unit's brief lists its scope: path globs, the interfaces it owns or changes, and the shared artifacts it needs. A claim whose scope overlaps a live claim's is queued, not refused: it becomes ready when the overlapping claim ends. A decision's tags are also scope tokens: units whose briefs declare the same decision tag as a shared artifact overlap, so two units deciding the same topic queue behind each other instead of filing contradicting decisions. A unit with no declared scope falls back to the paths its `Do` text names (the rule of 0156).
2. **Scope is enforced.** The verification gate fails a change that touches a path outside its unit's scope. A unit that needs something outside its scope files a **change request** to the unit that owns it (a child unit under the owner's parent, or a comment on its issue); it never widens its own scope. A unit that files a change request and depends on the answer parks (0168), which releases its scope until it is answered, so two units cannot wait on each other while holding what the other needs.
3. **A merge queue integrates.** The reviewer and conform passes of the gate stack (0158) run once per pull request, before it is queued. `ship` then enqueues a green change and waits for the merge result, so it still goes all the way to merge or reports why not (0163). The queue rebases a batch of changes whose scopes are disjoint on the default branch, reruns only the step `Check` and CI on the batch, and merges on green; a red batch is bisected to find the change that broke it, and that unit returns to its claimant with the failing check while the rest merge. Where `gh` reports a native merge queue, use it with the same outputs. The queue holds a claim ref of its own so only one runner acts at a time, and its state is the queue's refs, not a file. Overlaps nobody declared are caught here, not earlier.
4. **No shared counter or shared edited index.** A new fact or decision is filed under a unit-scoped draft id (`draft-<unit>-<slug>`); the merge queue assigns the final `NNNN` number when it merges (with the queue off, a post-merge CI job on the default branch does, and fails on a duplicate), and `INDEX.md` rows are generated from the artifacts' frontmatter, never hand-edited. This changes the filing rule "next free number" in `src/shared/artifact-model.md` and `AGENTS.md`; a wording change to a committed rule is allowed (0067).

It narrows 0156, whose conflict-awareness covered only steps within one plan on one machine.

## Why

With thousands of parallel units, three shared things collide: files two units edit, the next decision number, and the four index files every artifact PR edits. Declared scope prevents the known collisions cheaply; the queue turns the unknown ones into a rebase, not a broken default branch; generated ids and indexes remove the collisions that are structural.

## Tradeoffs considered

- **Optimistic only:** no planning cost, but rework and retry storms grow with the number of units and semantic conflicts reach CI.
- **Pessimistic path locks:** no collisions, but a stalled holder, often a human, blocks everyone behind it.
- **Cost accepted:** authors must declare scope, a wrong scope fails the gate, and the queue's throughput bounds the system (measured by 0170, tested by the soak test of work-coordination K18).
