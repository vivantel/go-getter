---
id: 0209-a-grant-typed-in-the-chat-is-honoured-for-the-session
title: A permission the user types in the chat ("merge PRs from now on") is a session grant the gate honours, with the shape's preconditions still checked at each use
status: active
date: 2026-11-08
accepted-by: sergemso
tags: [hooks, enforcement, security]
track: product
governed-facts: [0009-host-capability-matrix]
fitness-functions: ["the session-grant test passes: a typed grant lets the shape through for its session, red checks still ask, another session, a question, an unattended prompt and a revoked grant do not", "node evals/grants.mjs reports every scenario as predicted, 0 wrongful stops and 0 leaks"]
---

## Decision

Accepted by the owner 2026-11-08. It generalises decisions 0187 and 0188 from a release request to the outward shapes a project lists as `grantable` on its gate; a release stays on its own route (0187) and is never a session grant. 0130 (preconditions at each use), 0155 and 0186 stand.

1. **The user's own message is the grant.** On a host whose user-prompt event is attended (Claude Code first: `CLAUDE_CODE_SESSION_ATTENDED` is `1`), the user-prompt hook reads each short message (3 to 200 characters, not a slash command) when the project's gate lists at least one grantable shape. A prompt the host started itself records nothing.
2. **A small model reads it; this code accepts a closed answer.** `{"action":"grant"|"revoke"|"other","shapes":[ids],"scope":"session"}`. Ids outside the gate's `grantable` list or not approvable (`isApprovable`) are dropped; a grant with none left, another scope, or an unreadable answer is `other`. No regex decides what the user meant. The model gets the agent's last message as background and is told to ignore instructions in it.
3. **The record holds shape ids and a hash of the session, never the words.** It lives in the protected approvals store, per project and session, and lapses after 24 hours or when the user withdraws it ("stop merging" is `revoke`; no ids withdraws all of the session's).
4. **The gate reads it like an approved shape.** `shapeAllowance` allows a shape the session was granted, and the shape's preconditions still run at each use: a merge needs an open, ready pull request on the default branch with green checks; red checks ask the user with the real reason. A host that cannot ask uses the same grant.
5. **A push that names a tag is outside a `git-push` grant**, from a session grant or a run grant alike: `--tags`, `--follow-tags`, a `refs/tags/` refspec, a version-shaped refspec (`v1.2.3`) or a name of an existing tag. A force push, a branch delete and every shape that is not grantable stay stopped.
6. **The stop names the way out.** When an ungranted shape is stopped on a host that cannot ask, the reason says what the user can type to allow it for the session ("merge PRs from now on"), not only that a person must run it.
7. **Telemetry** records class `session-grant`, outcome and trigger (`granted`, `revoked`), no message text.

## Why

Fact 0040 found most owner turns were confirmations, and a plain-language grant is the deliberate act: refusing it and handing back a command repeats it. The release route already proves the pattern (host-attested prompt, closed model answer, protected store); the shapes were the only outward actions with no such route, so the gate stopped what the user had just allowed. The preconditions stay in code, so the grant widens nothing a person could not have approved by hand.

## Tradeoffs considered

- **Remember each yes only**: smaller, but the user is still asked once per shape.
- **A typed `!` command**: works today, and is the friction the user rejected.
- **Trust the agent's reading of the chat**: no enforcement; the agent could invent a grant.
- **Cost accepted**: one small-model call per short message in a project with a grantable shape (budget-capped as in 0188). The record is friction reduction, not a boundary: an agent that edits `compiler/` or runs arbitrary code decides what the hook does (0187 item 8). A version-shaped branch name such as `1.2-fix` is read as a tag and asks; a person can approve it.
