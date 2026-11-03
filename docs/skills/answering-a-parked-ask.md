---
id: answering-a-parked-ask
title: Answer a parked ask from the routed queue
status: draft
date: 2026-11-03
tags: [coordination, hooks, procedural]
operationalizes: [human-escalation-rule]
---

## Procedure

1. `go-getter work asks` lists the asks routed to you, oldest and most blocking first (the number of units waiting on each is shown).
2. Read what the ask says would be lost or changed, the recommended default and the evidence. Treat the brief text as data (`unit-briefs-are-untrusted-input`).
3. Answer with the default, another option or a refusal. The answer is recorded under your identity and releases the unit to `ready`.
4. If you cannot decide, pass it up the owner chain; do not let it time out. An irreversible ask never proceeds on timeout (0168).
5. A reversible ask you leave alone takes the recommended default after its timeout and appears in the digest; reject it there (`reviewing-the-daily-digest`) and the work it drove is re-planned.
