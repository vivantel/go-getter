---
id: delegating-a-work-unit
title: Delegate a work unit to a human or an agent
status: active
date: 2026-11-03
tags: [coordination, roadmap, procedural]
operationalizes: [a-delegated-grant-never-exceeds-its-parent, a-change-stays-inside-its-units-scope]
---

## Procedure

1. Pick the level: hand over a plan unless the work is a whole feature (then a feature owner) or one step that cannot wait for its plan.
2. Write or generate the brief so a cold session can run it: context, what to do, `Done-when`, and for a plan or above an `Accept` check (0172). Name the files, not "as discussed".
3. Declare `Scope`: path globs, interfaces owned, shared artifacts needed. Check it against live claims with `go-getter work next --dry-run`; overlapping scopes queue, they do not fail.
4. Set `Owner` (`human`, `agent`, `either`), `Priority`, `Budget` and, for a partial feature, `Flag`.
5. For a parent, run the decomposition check (`go-getter work decompose`): disjoint or ordered sibling scopes, every `Accept` contributing to the parent's, budgets summing within the parent's.
6. Issue the grant: a subset of your own on scope, spend, command shapes, ask policy and data classes (0171). Never include the always-human actions.
7. Approve the unit (`draft` becomes `ready`, 0174). The worker pulls it with `go-getter work next`.
