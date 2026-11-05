---
id: accepting-a-unit
title: Accept a plan or feature on the integrated result
status: draft
date: 2026-11-03
tags: [coordination, verification, procedural]
operationalizes: [a-unit-is-accepted-by-someone-other-than-its-author]
---

## Procedure

1. Confirm your worker id does not appear in the claims ledger history as a holder of the unit or any descendant, now or earlier; otherwise hand it to another worker. `go-getter work accept <unit>` checks this and exits 4 when you are an author.
2. Start from the merged result on the default branch (or behind the unit's flag), not from the authors' branches.
3. Read only the unit's brief and `Accept` check; give a reviewer agent the same and no author transcript.
4. Run `go-getter work accept <unit> [--reviewer <cmd>]`: it runs the `Accept` check and passes the reviewer command only the brief and the result on stdin. For a feature also run the cross-plan contract checks and the feature's behavior evals.
5. Pass: record the result and mark the unit `done`; for a feature with a flag, turn the flag on (a human act when it reaches production).
6. Fail: the unit stays not done under its claim, with the failing evidence recorded in the ledger. If the defect merged past a lower gate, it is an escape: run `go-getter work escape <unit> --merged-at <level> --found-at <level>` (it raises the audit sampling rate below the finder's level) and add the missing check, guardrail or reviewer instruction (0172 item 4).
