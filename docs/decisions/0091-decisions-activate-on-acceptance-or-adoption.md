---
id: 0091-decisions-activate-on-acceptance-or-adoption
title: A decision stays draft until the owner accepts it or it is adopted, whichever comes first; committing it is not adoption
status: active
date: 2026-10-06
tags: [knowledge-management, dogfooding]
track: process
accepted-by: sergemso
---

## Decision

Draft from the owner's instruction (2026-10-06); active since it was first applied, when 0089 and 0090 were adopted.

- A decision committed to git stays `draft`. Committing records it; it commits nobody to it.
- It becomes `active` when the owner explicitly accepts it (`accepted-by` names them), or when it is adopted: put into effect, for example `apply` now enforces it, a pack that implements it is adopted by a project, or the behaviour it describes runs in this repo. The change that adopts it flips the status.
- Merging code that could implement it, without it taking effect, is not adoption.
- Existing drafts (0076, 0085, 0086, 0087) are not changed by this decision; each stays draft until it is accepted or adopted under this rule.

## Why

Drafts written by agents while the owner was away had no defined path to `active`, and an implemented but never accepted draft leaves the knowledge base saying one thing and the code another.

## Tradeoffs considered

- **Accept only**: clear accountability, but implemented decisions linger as drafts.
- **Active on merge of the implementing PR**: simple, but an agent merging under a blanket authorisation would activate decisions the owner never read.
