---
id: reviewing-the-daily-digest
title: Review the day's autonomous work in one sitting
status: active
date: 2026-11-01
tags: [roadmap, dogfooding, procedural]
operationalizes: [raw-commands-redirect-to-verbs]
---

## Procedure

1. `go-getter digest [--mark]` lists, since the last digest (`--mark` starts the next one from now): merged PRs, logged default decisions (`draft`), triggers that stopped a run, spend, and the audit sample from `go-getter audit pick`.
2. Accept or reject each logged default: accepted drafts become `active` (with `accepted-by`); a rejected one becomes a new decision that supersedes it, and the work it drove is re-planned.
3. Read the audit sample and every flagged PR. For each defect, add a check, guardrail or reviewer instruction before the next run (0158).
4. Approve the batched release by asking for it in the chat ("release"), or leave it for tomorrow. The release pull request says whether a person typed the approval or asked for it in the chat.
5. Record the day's human minutes (`go-getter metrics day`) against the baseline of fact 0040.
