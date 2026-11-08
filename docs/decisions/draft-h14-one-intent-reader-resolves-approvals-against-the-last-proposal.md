---
id: draft-h14-one-intent-reader-resolves-approvals-against-the-last-proposal
title: One small-model reader turns what the user typed into release, grant, revoke or approve, and resolves "go ahead" against the agent's last proposal
status: draft
date: 2026-11-08
tags: [hooks, enforcement, security]
track: product
governed-facts: [0009-host-capability-matrix]
fitness-functions:
  - "the intent-reader test passes: approvals resolve against the last proposal, a hostile proposal grants nothing, a release stays on its route"
  - "node evals/grants.mjs reports every scenario as predicted, 0 wrongful stops and 0 leaks"
---

## Decision

Draft. Supersedes the reading part of 0188 (the keyword filter, the exact-phrase grammar as the only fast path, the 80-character cap) and widens 0209; 0187 and 0130 stand.

1. **One reader.** The user-prompt hook asks a small model once per eligible message and accepts a closed answer: `release`, `grant`, `revoke`, `approve` or `other`, with the shape ids affected from the project's grantable list. The prompt defines the categories; it carries no word list and no incident patches.
2. **Eligibility is structural, not lexical.** An attended session, a message that is short and is not a slash command or a paste, and a project that has a release or a grantable shape. No keyword decides whether the model sees a message. The exact release phrases (`release minor`) stay as a shortcut that skips the model; they never narrow what the model can recognise.
3. **`approve` resolves "go", "go ahead", "yes", "do it" against the agent's last message.** The model names the shapes that proposal states outright. A proposal that names a release, a tag push, a force push or a delete, or that the model cannot place, yields `other`, and a release proposal goes to the release route (0187).
4. **An approval is narrower than a grant.** It covers the named shapes for the current branch and the pull request made from it, and lapses when that pull request merges, after two hours, or on the user's next message that is not an approval. A grant ("from now on") stays session-wide (0209). A project may map a word to shapes in its pack answer (`ship` = create the pull request, push to its branch, merge it when green); the model only decides whether the word is used as an order.
5. **The agent's words are untrusted input.** The shape list is closed, the shape's preconditions run at each use, a release pull request and a tag are outside every grant, and only an attended message from the user records anything. The record holds shape ids, the branch and a session hash, never the words.
6. **Latency.** The hook must not hold the user's prompt for the model call. The read runs detached and writes its record when done; a gated call that arrives while a read for its session is pending waits for it, up to a short limit, then falls back to the ordinary stop.

## Why

The owner's "go" and "go ahead" are approvals of the previous turn's suggestion, so their meaning is in the agent's last message, not in the word. A keyword filter in front of the model cannot know that, and it sends "go ahead" to the release reader only, where a merge proposal reads as `other`. One reader with the proposal as context decides all four intents in one place.

## Tradeoffs considered

- **Keep separate release and grant readers**: two prompts, two filters and two sets of overfitted cases; "ship" and "go" fall between them.
- **Trust the agent to say what was approved**: no enforcement; the agent could claim any approval.
- **Cost accepted**: one small-model call per eligible short message, off the critical path; a short wait on a gated call that races a pending read.
