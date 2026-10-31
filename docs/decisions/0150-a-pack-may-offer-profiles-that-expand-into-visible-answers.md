---
id: 0150-a-pack-may-offer-profiles-that-expand-into-visible-answers
title: A pack may offer profiles, named answer bundles for one topic that expand into per-question answers; setup stays a guided interview
status: active
date: 2026-10-31
tags: [interview, practice-packs, configuration, positioning]
track: product
accepted-by: sergemso
---

## Decision

Supersedes 0003 once accepted (0091). It keeps 0003's commitments and narrows only its "no preset profiles" clause, which no longer holds. Extends 0149.

1. **Kept from 0003.** Setup is a guided interview: one question at a time with each option's tradeoff and a recommended default, so accepting the defaults is the fast path. Repo facts are detected to prefill or skip questions. There is no browse-and-install catalog as a configuration path.
2. **A pack may declare profiles.** A profile is `{ id, label, tradeoff, recommended?, answers }`: a named set of answers to some of the pack's own questions, covering one topic of that pack (for example task isolation: worktree per task, a clone per task, one tree with a lock). A pack's profiles are alternatives; at most one is marked recommended. It is not a global "solo / team / regulated" preset and spans no pack.
3. **A profile is asked as one question.** `interview next` (0147) asks "which approach?" first, with the profile tradeoffs, plus "customise", which opens its questions one by one. The questions a chosen profile answers are not asked.
4. **A profile expands; it is not stored.** The interview resolves it to answers per question. The dry run lists each expanded answer marked with its profile, `render-pack` writes one decision per question with that question's rationale, and the artifacts record the answers, not the profile. A later `reconfigure` or `update` sees ordinary answers (0090).
5. **Validation is the pack's.** A profile's answers are checked like typed ones (option ids, `pattern`, `when`); a profile naming an unknown question or option fails the pack's load. A `when` that makes a profile's answer inapplicable drops that answer.
6. **A seeded file can name a profile** (0149) as `{ "profile": { "<topic>": "<id>" } }` beside `answers`; explicit answers win over it.
7. **A profile counts as a recommended default** for the guardrail `pack-questions-have-a-recommended-default`: every question it covers still names one recommended option.

## Why

A single concern spans several questions: task isolation alone is `isolation`, `worktree-location` and `max-concurrent`. Asking them separately across a dozen areas makes setup unusable (the owner's report, 2026-10-31). 0003 rejected presets because they were opaque; expanding a profile into visible per-question answers and decisions keeps what 0003 protects (deliberate, rationale-bearing choices that feed the knowledge base, 0007) and removes the question count.

## Tradeoffs considered

- **Tiering questions as basic or advanced**: needs no change to 0003 and cuts volume, but captures no coherent approach. Decided beside profiles in 0151.
- **Global presets (solo / team / regulated)**: shortest, but opaque and spans packs; rejected as 0003 did.
- **Store the profile and re-expand on update**: smaller artifacts, but a profile changed in a later pack version would silently change a project's rules, which 0090 forbids.
- **Cost accepted:** each profile is hand-written and may drift from its questions; the pack load check (item 5) and a test per profile are the guard.

