---
id: accepting-a-unit
title: Accept a plan or feature on the integrated result
status: active
date: 2026-11-03
tags: [coordination, verification, procedural]
operationalizes: [a-unit-is-accepted-by-someone-other-than-its-author]
---

## Procedure

1. Confirm you hold no claim on the unit or any descendant; otherwise hand it to another worker.
2. Start from the merged result on the default branch (or behind the unit's flag), not from the authors' branches.
3. Read only the unit's brief and `Accept` check; give a reviewer agent the same and no author transcript.
4. Run the `Accept` check. For a feature also run the cross-plan contract checks and the feature's behavior evals.
5. Pass: record the result and mark the unit `done`; for a feature with a flag, turn the flag on (a human act when it reaches production).
6. Fail: re-open the unit under its claim with the failing evidence. If the defect merged past a lower gate, it is an escape: add the missing check, guardrail or reviewer instruction (0172 item 4).
