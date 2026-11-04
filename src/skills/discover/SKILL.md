---
name: discover
description: Interview the user to an outcome brief (the hypothesis, meters, target, window and attribution method that say what is worth achieving and how success is read), stopping at the brief's approval. Use for what to achieve and how we will know, not for how to split it into units (that is `roadmap`), e.g. "discover what this should achieve", "write an outcome brief for X".
---

Discover owns one artifact, the outcome brief (`docs/outcomes/<id>.md`), and one decision: whether an outcome is worth pursuing and how its success is read (decision 0177). Splitting an approved outcome into units belongs to `roadmap`; this skill never does it.

## Interview mechanics

Same as the `clarify` skill. Walk down each branch of the decision tree, resolving dependencies one by one.

Ask questions one at a time, waiting for the answer. If a *fact* can be found by exploring the environment (files, meters, earlier readings, existing briefs), look it up rather than asking. The *decisions* are the user's: put each one to them with your recommended answer.

When a decision has discrete options:
- Cap at 4 total, free-text catch-all included; merge similar options rather than exceed the cap.
- State each option's tradeoff; mark the recommended one "(Recommended)".
- Numeric answer (count, date, size)? Ask openly with an optional default.
- Selectable-question tool available? Use it; its built-in "Other" is the free-text slot. Otherwise number the options with plain digits and append exactly one final free-text option.

## Procedure

Follow `docs/skills/defining-an-outcome-brief.md`:

1. Hypothesis: what should change, for whom, and why you expect it.
2. Meters: choose from `docs/meters/`. If none reads it, define one per `docs/skills/defining-a-meter.md` (what it reads, source, capability tags, refresh rate, cost per reading, noise, owner, data class, retention; a class and cap if a reading causes a real-world effect). Prefer an early meter with a short window beside the final one.
3. Target and observation window, in wall-clock time, and what the unit does while it waits.
4. Attribution method: the holdout, control or before-and-after comparison, and what would break it. A brief without one is not approved (decision 0178).
5. Budget, effect caps, review cadence, and what is already known as evidence.
6. Search `docs/outcomes/` for a brief on the same hypothesis; propose updating it rather than writing a duplicate.

## Before writing

List the files this session will create (the brief, and any meter files it needs) and get one explicit go-ahead before touching disk.

Then save the brief as `docs/outcomes/<id>.md` (and its row in `docs/outcomes/INDEX.md`) and run `go-getter outcome check <id>`; fix what it refuses until it passes.

## Stop at approval

Submit the brief as a parked ask to its approver (a human for a root outcome, the grant holder for a sub-outcome; decisions 0168, 0178) and stop. State the recommended answer and the evidence in the ask.

## Hard limits

- Write only the outcome brief and the meters it needs. No knowledge artifacts, no plan, no units, no code.
- Never decompose, plan or start delivery; an approved brief is handed to `roadmap`.
- Never approve the brief yourself.
