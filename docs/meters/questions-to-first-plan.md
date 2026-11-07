---
id: questions-to-first-plan
title: Questions a person answers, and sessions used, from a one-sentence goal to a plan that parses
reads: one integer, the number of questions the person answered between the one-sentence goal and a plan file that `go-getter plan next` parses, for one trial goal
source: a person (the owner) counts the questions and sessions of one run and records the question count
capabilities: [person]
refresh: 1w
cost: 0
noise: medium; goal size and the person's familiarity move the count, so read it on goals of different kinds
owner: sergemso
data-class: internal
retention: 12mo
---

## What one reading is

One integer for one trial goal: every question the interviewer put to the person (a selectable question or a plain one) from the first sentence until the plan parses. Record only the number with `go-getter measure read questions-to-first-plan --value <n>`: a reading holds no free text. The sessions used and the files written go in the review log of the outcome brief `faster-plan-start`, one line per trial goal, with no goal text or answers (`telemetry-records-metadata-only`).

Read the median over the trial goals; one goal is one reading.
