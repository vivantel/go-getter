---
id: faster-plan-start
title: A person starts a plan for a custom epic from one sentence, in one session, with at most eight questions
status: draft
hypothesis: If discover derives a draft brief from one sentence and asks only the decisions that cannot be defaulted, and the meter and approval steps stop asking what can be derived, then a person gets a parsing plan for a custom epic in one session with few questions. Today the two-skill flow needs about 32 questions over two sessions and about 12 files, against about 10 questions for the old single roadmap. The goal must keep an attribution method and an effect cap for goals with real-world effects (decisions 0177, 0178, 0180).
meters: [questions-to-first-plan]
target: median questions-to-first-plan <= 8 over 5 trial goals, each finished in one session
window: 4 weeks from approval. While it waits the unit is parked as awaiting-window and wakes weekly; it ends early once 5 trial goals are read. The 5 are real upcoming goals of different kinds (a small feature, a refactor, a docs epic, a research task, one with a real-world effect); no single domain.
attribution: Before and after on the same kinds of goals. Re-run two past goals through the new flow and compare with their old counts, then read three new goals. Breaks if easy goals are chosen, if answers are given from memory of an earlier run, or if the goal mix is all small.
budget: agent time only, no spend
effect-caps: reversible only - skill, procedure and CLI edits on branches through pull requests; no outward or irreversible effect
review-cadence: at each weekly reading and at week 4
---

## Evidence so far

A dry run of the current flow on one large goal with a real-world effect (selling a product) counted about 22 discover questions and 10 roadmap questions, about 12 files, and at least two sessions. It was a single simulated run, so it is a data point, not a baseline. Root causes found: one full brief for every goal, no stated defaults, a nested meter interview, two go-aheads plus a parked approval, skills ahead of the plan parser (capability tags, owner kind), and `plan draft` unconnected to the outcome model. `outcome check` accepts draft briefs and does not validate meter files.

Candidate changes to test, in order: a fast path that derives the draft brief; meter templates and a validating `outcome check`; tiering by effect class and window.

## Review log

One line per trial goal, added at each review: kind of goal, questions (the meter value), sessions used, files written. The target needs both the median questions and one session per goal, and the meter holds only the first.
