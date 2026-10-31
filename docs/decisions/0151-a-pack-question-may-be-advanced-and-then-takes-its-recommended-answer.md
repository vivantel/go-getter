---
id: 0151-a-pack-question-may-be-advanced-and-then-takes-its-recommended-answer
title: A pack question may be tiered advanced; the interview then takes its recommended answer, renders its decision and lists it in the dry run
status: active
date: 2026-10-31
tags: [interview, practice-packs, configuration]
track: process
accepted-by: sergemso
---

## Decision

Extends 0003, 0085 and 0147; supersedes none. Complements 0150: profiles cut a coherent cluster of questions, tiers cut the independent tail.

1. **A question declares `tier: basic | advanced`.** Absent means basic, so no existing pack changes behaviour.
2. **An advanced question is not asked by default.** The interview takes, in order, the detected value, the question's `default`, the recommended option. `interview next` (0147) never returns it unless asked with `--advanced`, and the skill offers "customise" for it.
3. **Its decision is still rendered.** An advanced answer produces the same decision, with the same rationale, as an asked one, and is recorded as an ordinary answer, so `reconfigure` and `update` (0090, 0148) read it back unchanged.
4. **The dry run lists every advanced answer taken**, per pack and question, with the value and the rule it produces.
5. **Limits, checked when the pack loads and by a test per pack.** A question is basic, whatever its author declares, if it has no recommended option and no default, if its answer alone turns the enforcement of a guardrail on or off, or if it sets how data, secrets or paths are handled (the `restricted-data` and `data-policy` families and any `hitl` gating class).
6. **Moving a question between tiers** is not a new question: a recorded answer stays valid (0085), and an advanced question moved to basic is asked on the next reconfigure only if it has no recorded answer.
7. **"Accept the rest of this pack"** stays: it takes the recommended or prefilled value for the remaining basic questions.

## Why

`verification-gate` asks 17 questions, 12 of them text and 10 with a detected value; most are "keep the detected command". Asking each one makes setup long without making it more deliberate. Rendering the advanced answers and listing them in the dry run keeps what 0003 protects, while the limits in item 5 keep every safety-relevant choice deliberate.

## Tradeoffs considered

- **User-driven shortcut only ("accept the rest")**: already exists, but all-or-nothing and the default path stays long.
- **Author judgement of what is advanced**: simpler, but a consequential question can be hidden; item 5 fixes the rule instead.
- **Skip advanced questions without rendering**: shorter output, but leaves gaps in the knowledge base and in `update` recovery.
- **Cost accepted:** the tier of each question is a hand-made call to keep in step with the limits of item 5; the load check is the guard. A batched "confirm all detected values" question may be a bigger gain for `verification-gate` and is not decided here.
